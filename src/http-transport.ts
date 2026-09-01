import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { SignalConfig } from "./config.js";
import type { Logger } from "./logger.js";

export interface HttpServerHandle {
  /** Public URL of the MCP endpoint, e.g. http://127.0.0.1:3000/mcp */
  url: string;
  /** Shut the HTTP server down (closes active sessions first). */
  close(): Promise<void>;
}

export const MCP_PATH = "/mcp";

/**
 * Read the request body into a Buffer, refusing anything over maxBytes. When
 * the cap is exceeded, buffering stops immediately and the promise resolves
 * null; the stream keeps draining so the socket ends up in a clean state,
 * while nothing beyond the cap is ever held in memory.
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      total += chunk.length;
      if (total > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

/**
 * Timing-safe check of the `Authorization: Bearer <token>` header. Both sides
 * are hashed to a fixed 32-byte digest first, so timingSafeEqual never throws
 * and the comparison always takes the same time whether the header is missing,
 * malformed, or merely wrong.
 */
function isBearerAuthorized(req: IncomingMessage, expectedToken: string): boolean {
  const auth = req.headers.authorization;
  const header = typeof auth === "string" ? auth : "";
  const expected = createHash("sha256").update(`Bearer ${expectedToken}`).digest();
  const provided = createHash("sha256").update(header).digest();
  return timingSafeEqual(expected, provided);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Start a streamable HTTP transport for the MCP server, per the MCP spec:
 *   GET    - open an SSE event stream for an existing session
 *   POST   - JSON-RPC (initialization creates a new session)
 *   DELETE - terminate a session
 *
 * Only `{MCP_PATH}` and `/` are served. Each client session gets its own
 * McpServer + transport instance (the MCP SDK only allows one transport
 * connection per Server). Hardening that always applies: when `config.apiToken`
 * is set, every request must carry `Authorization: Bearer <token>` (checked in
 * constant time); POST bodies larger than `config.maxBodyBytes` get a 413
 * before any parsing; requests whose Host header falls outside the allowed
 * list get a 403 from the transport's DNS rebinding protection; and sessions
 * idle for more than `config.sessionTtlSeconds` are swept closed, after which
 * their id answers 404 like any unknown session.
 *
 * @param serverFactory creates a fresh McpServer per session (tools are stateless,
 *   so this is cheap and keeps sessions isolated).
 */
export async function startHttpServer(
  serverFactory: () => McpServer,
  config: SignalConfig,
  logger: Logger,
): Promise<HttpServerHandle> {
  interface SessionRecord {
    transport: StreamableHTTPServerTransport;
    /** Time of the most recent request carrying this session id (Date.now ms). */
    lastSeen: number;
  }

  const sessions = new Map<string, SessionRecord>();
  // Requests currently being handled, counted per session id. The idle sweep
  // skips sessions with an in-flight request, so it never closes a session
  // while a request (say, a long-lived SSE GET stream) is still being handled.
  // A count rather than a flag: one session can hold several requests at once,
  // and finishing one must not release the others.
  const inFlight = new Map<string, number>();

  /**
   * Count one request as activity for a session. lastSeen is marked before the
   * request runs, so idle time is measured from the last request that arrived,
   * and the in-flight count keeps the idle sweep from closing the session while
   * that request is still being handled. The count is released in a finally, so
   * a rejected or errored request cannot leak a slot.
   */
  async function withSessionActivity(
    id: string,
    record: SessionRecord,
    run: () => Promise<void>,
  ): Promise<void> {
    record.lastSeen = Date.now();
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
    try {
      await run();
    } finally {
      const remaining = (inFlight.get(id) ?? 1) - 1;
      if (remaining > 0) inFlight.set(id, remaining);
      else inFlight.delete(id);
    }
  }

  const httpServer = http.createServer((req, res) => {
    void handleRequest(req, res).catch((error) => {
      logger.warn("http handler error", {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        res.end();
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname !== MCP_PATH && url.pathname !== "/") {
      sendJson(res, 404, { error: `Not found: ${url.pathname}` });
      return;
    }

    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      res.writeHead(405, { "content-type": "application/json", allow: "GET, POST, DELETE" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    if (config.apiToken && !isBearerAuthorized(req, config.apiToken)) {
      sendJson(res, 401, { error: "Unauthorized: missing or invalid bearer token" });
      return;
    }

    const sessionId =
      typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;

    // Pre-parse the JSON-RPC body for POST requests. Oversized bodies are
    // rejected before any buffering or parsing happens (POST only; the other
    // methods carry no body).
    let parsedBody: unknown;
    if (req.method === "POST") {
      const body = await readBody(req, config.maxBodyBytes);
      if (body === null) {
        sendJson(res, 413, {
          error: `Payload too large: body exceeds SIGNAL_MAX_BODY_BYTES (${config.maxBodyBytes} bytes)`,
        });
        return;
      }
      if (body.length > 0) {
        try {
          parsedBody = JSON.parse(body.toString("utf8"));
        } catch {
          // Leave undefined; the transport reports the JSON parse error.
        }
      }
    }

    if (req.method === "DELETE") {
      if (!sessionId) {
        sendJson(res, 400, { error: "Missing mcp-session-id header" });
        return;
      }
      const existing = sessions.get(sessionId);
      if (!existing) {
        sendJson(res, 404, { error: "Unknown session" });
        return;
      }
      await withSessionActivity(sessionId, existing, () =>
        existing.transport.handleRequest(req, res, parsedBody),
      );
      // Only forget the session when the delete was accepted. A rejected
      // request (forged Host header) must leave the session untouched.
      if (res.statusCode === 200) {
        sessions.delete(sessionId);
      }
      return;
    }

    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (sessionId && existing) {
      await withSessionActivity(sessionId, existing, () =>
        existing.transport.handleRequest(req, res, parsedBody),
      );
      return;
    }

    // A session id the map does not know is one the server issued and has
    // since closed (expired idle session, accepted DELETE) or one that never
    // existed. Only an initialization request may open a session, so anything
    // else gets the 404 the streamable HTTP spec wants for a dead session.
    // Answering here also keeps a stale id from spinning up a throwaway
    // transport that could only reject the request itself.
    if (sessionId && !(parsedBody && isInitializeRequest(parsedBody))) {
      sendJson(res, 404, { error: "Session not found" });
      return;
    }

    if (!(parsedBody && isInitializeRequest(parsedBody))) {
      sendJson(res, 400, {
        error: "Bad Request: Mcp-Session-Id header is required for non-initialization requests",
      });
      return;
    }

    // The transport self-registers in the session map once initialization runs.
    // It is stored in a holder so its own onsessioninitialized callback can
    // capture the (mutually-referential) transport instance.
    const holder: { transport?: StreamableHTTPServerTransport } = {};
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      // DNS rebinding protection: the SDK compares the raw Host header string
      // exactly, port included, and answers 403 for anything outside the list.
      enableDnsRebindingProtection: true,
      allowedHosts,
      onsessioninitialized: (id) => {
        if (holder.transport && id) {
          sessions.set(id, { transport: holder.transport, lastSeen: Date.now() });
        }
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
    });
    holder.transport = transport;

    const server = serverFactory();
    await server.connect(transport);

    // Keep the session map in sync when a transport closes on its own
    // (e.g. SSE connection dropped without an explicit DELETE).
    const baseClose = transport.onclose;
    transport.onclose = () => {
      baseClose?.();
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await transport.handleRequest(req, res, parsedBody);
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const port = address && typeof address === "object" ? address.port : config.port;

  // Idle sessions expire after sessionTtlSeconds without any request carrying
  // their id. The sweep runs at most a minute apart, but never more than half
  // the TTL, so expiry is detected promptly without spinning on a short timer.
  const ttlMs = config.sessionTtlSeconds * 1000;
  const sweepIntervalMs = Math.min(Math.max(ttlMs / 2, 1_000), 60_000);

  async function sweepIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const [id, record] of sessions) {
      if (now - record.lastSeen <= ttlMs) continue;
      // A request still in flight keeps its session alive until it finishes;
      // the next sweep picks the session up if it has gone idle by then.
      if (inFlight.has(id)) continue;
      sessions.delete(id);
      try {
        await record.transport.close();
      } catch (error) {
        logger.debug("failed to close expired session", {
          sessionId: id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      logger.info("closed idle HTTP session", { sessionId: id });
    }
  }

  const idleSweep = setInterval(() => {
    void sweepIdleSessions();
  }, sweepIntervalMs);
  // Housekeeping must never hold the process open on its own.
  idleSweep.unref();

  // Hosts the transport accepts. The SDK compares the raw Host header, so every
  // form a local client could send is listed. The port is only known after
  // listen, because PORT=0 binds an ephemeral port. IPv6 literals arrive
  // bracketed in the Host header, so both bare and bracketed forms are listed.
  // Operators behind a reverse proxy or remote gateway override this list via
  // SIGNAL_ALLOWED_HOSTS.
  const hostForms = (host: string): string[] => {
    const base = [host, `${host}:${port}`];
    return host.includes(":") ? [...base, `[${host}]`, `[${host}]:${port}`] : base;
  };
  // An IPv6 any-address bind serves ::1 clients, so its forms are allowed too.
  const boundHosts = config.host === "::" ? [config.host, "::1"] : [config.host];
  const derivedAllowedHosts = [
    ...boundHosts.flatMap(hostForms),
    ...hostForms("localhost"),
    ...hostForms("127.0.0.1"),
  ];
  const allowedHosts = config.allowedHosts ?? [...new Set(derivedAllowedHosts)];

  // Bracket IPv6 literals so the printed endpoint is a valid URL.
  const displayHost =
    config.host === "0.0.0.0" ? "127.0.0.1" : config.host.includes(":") ? `[${config.host}]` : config.host;
  const url = `http://${displayHost}:${port}${MCP_PATH}`;

  return {
    url,
    close: async () => {
      clearInterval(idleSweep);
      await Promise.allSettled(
        [...sessions.values()].map((record) => record.transport.close()),
      );
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
