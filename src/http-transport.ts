import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
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

/** Read the request body into a Buffer. */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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
 * connection per Server). When `config.apiToken` is set, every request must
 * carry `Authorization: Bearer <token>`.
 *
 * @param serverFactory creates a fresh McpServer per session (tools are stateless,
 *   so this is cheap and keeps sessions isolated).
 */
export async function startHttpServer(
  serverFactory: () => McpServer,
  config: SignalConfig,
  logger: Logger,
): Promise<HttpServerHandle> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

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

    if (config.apiToken) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${config.apiToken}`) {
        sendJson(res, 401, { error: "Unauthorized: missing or invalid bearer token" });
        return;
      }
    }

    const sessionId =
      typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;

    // Pre-parse the JSON-RPC body for POST requests.
    let parsedBody: unknown;
    if (req.method === "POST") {
      const body = await readBody(req);
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
      await existing.handleRequest(req, res, parsedBody);
      sessions.delete(sessionId);
      return;
    }

    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      await existing.handleRequest(req, res, parsedBody);
      return;
    }

    // No existing session: only initialization requests may open one.
    if (!sessionId && !(parsedBody && isInitializeRequest(parsedBody))) {
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
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        if (holder.transport && id) {
          sessions.set(id, holder.transport);
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
  const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  const url = `http://${host}:${port}${MCP_PATH}`;

  return {
    url,
    close: async () => {
      await Promise.allSettled([...sessions.values()].map((transport) => transport.close()));
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
