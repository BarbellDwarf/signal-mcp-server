import http from "node:http";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SignalConfig } from "../../src/config.js";
import { startHttpServer, type HttpServerHandle } from "../../src/http-transport.js";
import { createLogger } from "../../src/logger.js";
import { SignalClient } from "../../src/signal-client.js";
import { createSignalMcpServer } from "../../src/server.js";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw-http-client", version: "1.0.0" },
  },
});

const JSON_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

interface RawResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

/**
 * Minimal node:http client. fetch refuses to set the Host header, so the
 * DNS rebinding tests below need raw requests with an explicit Host override.
 */
function rawRequest(
  url: URL,
  options: { headers?: Record<string, string>; body?: string; method?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        // WHATWG URL keeps brackets on IPv6 hostnames; node:http wants the
        // bare literal to connect and brackets only inside the Host header.
        host: url.hostname.replace(/^\[/, "").replace(/\]$/, ""),
        port: url.port,
        path: url.pathname,
        method: options.method ?? "POST",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(options.body ?? "");
  });
}

interface StartedServer {
  api: MockSignalApiHandle;
  server: HttpServerHandle;
  url: URL;
}

describe("HTTP transport hardening (in-process)", () => {
  const started: StartedServer[] = [];

  async function startServer(overrides: Partial<SignalConfig> = {}): Promise<StartedServer> {
    const api = await startMockSignalApi();
    const config: SignalConfig = {
      signalApiUrl: api.url,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      maxBodyBytes: 10485760,
      sessionTtlSeconds: 3600,
      logLevel: "error",
      ...overrides,
    };
    const server = await startHttpServer(
      () => createSignalMcpServer(new SignalClient({ baseUrl: api.url }), config),
      config,
      createLogger("error"),
    );
    const entry = { api, server, url: new URL(server.url) };
    started.push(entry);
    return entry;
  }

  afterAll(async () => {
    for (const entry of started.reverse()) {
      await entry.server.close();
      await entry.api.close();
    }
  });

  it("rejects a POST body over SIGNAL_MAX_BODY_BYTES with 413 before it reaches the backend", async () => {
    const { api, url } = await startServer({ maxBodyBytes: 64 });
    const oversized = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "raw-http-client", version: "1.0.0" },
        _padding: "x".repeat(65536),
      },
    });

    const response = await rawRequest(url, {
      headers: { ...JSON_HEADERS, "content-length": String(oversized.length) },
      body: oversized,
    });

    expect(response.status).toBe(413);
    expect(JSON.parse(response.body)).toHaveProperty("error");
    expect(api.requests).toHaveLength(0);
  });

  it("answers 401 with the same error for missing, malformed, and wrong bearer tokens", async () => {
    const { url } = await startServer({ apiToken: "correct-token" });

    const missing = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
    const malformed = await rawRequest(url, {
      headers: { ...JSON_HEADERS, authorization: "Basic dXNlcjpwYXNz" },
      body: INITIALIZE,
    });
    const wrong = await rawRequest(url, {
      headers: { ...JSON_HEADERS, authorization: "Bearer wrong-token" },
      body: INITIALIZE,
    });

    for (const response of [missing, malformed, wrong]) {
      expect(response.status).toBe(401);
      expect(JSON.parse(response.body)).toEqual({
        error: "Unauthorized: missing or invalid bearer token",
      });
    }
  });

  it("answers 403 for a forged Host header and accepts the real one", async () => {
    const { url } = await startServer();

    const forged = await rawRequest(url, {
      headers: { ...JSON_HEADERS, host: "evil.example" },
      body: INITIALIZE,
    });
    expect(forged.status).toBe(403);
    expect(JSON.parse(forged.body).error).toMatchObject({
      code: -32000,
      message: "Invalid Host header: evil.example",
    });

    // The transport compares the raw Host header string, port included, so the
    // accepted value is exactly what the server derived after listen.
    const real = await rawRequest(url, {
      headers: { ...JSON_HEADERS, host: url.host },
      body: INITIALIZE,
    });
    expect(real.status).toBe(200);
    expect(real.body).toContain('"result"');
  });

  it("accepts bracketed IPv6 Host headers and prints a parseable endpoint URL", async () => {
    let entry: StartedServer;
    try {
      entry = await startServer({ host: "::1" });
    } catch {
      // Environment has no IPv6 loopback; the IPv4 path is covered elsewhere.
      return;
    }
    // The endpoint must be a valid URL even for IPv6 binds: startServer's
    // new URL() would have thrown on an unbracketed ::1 literal.
    expect(entry.url.hostname).toBe("[::1]");
    expect(entry.url.host).toBe(`[::1]:${entry.url.port}`);

    const response = await rawRequest(entry.url, {
      headers: { ...JSON_HEADERS, host: `[::1]:${entry.url.port}` },
      body: INITIALIZE,
    });
    expect(response.status).toBe(200);
    expect(response.body).toContain('"result"');
  });

  it("locks out remote Host headers on a wildcard bind unless SIGNAL_ALLOWED_HOSTS allows them", async () => {
    const locked = await startServer({ host: "0.0.0.0" });
    const remote = await rawRequest(locked.url, {
      headers: { ...JSON_HEADERS, host: "192.0.2.1:3000" },
      body: INITIALIZE,
    });
    expect(remote.status).toBe(403);

    const opened = await startServer({ host: "0.0.0.0", allowedHosts: ["192.0.2.1:3000"] });
    const allowed = await rawRequest(opened.url, {
      headers: { ...JSON_HEADERS, host: "192.0.2.1:3000" },
      body: INITIALIZE,
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toContain('"result"');
  });

  it("keeps a session alive when a forged-Host DELETE is rejected", async () => {
    const { url } = await startServer();

    const init = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
    expect(init.status).toBe(200);
    const sessionId = init.headers["mcp-session-id"] as string;
    expect(sessionId).toBeTruthy();

    const rejectedDelete = await rawRequest(url, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId!, host: "evil.example" },
    });
    expect(rejectedDelete.status).toBe(403);

    // The session must still answer: the rejected delete never removed it.
    const followUp = await rawRequest(url, {
      headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(followUp.status).toBe(200);
    expect(followUp.body).toContain('"result"');
  });

  // The sweep interval is half the TTL (capped at a minute), so with the 60s
  // schema minimum it fires at t=30s, 60s, 90s. Expiry needs "idle strictly
  // past 60s", which lands on the t=90s sweep, hence the 91s advance below.
  function useFakeSweepTimers(): void {
    // Fake only the interval and the clock. Sockets, promises, and everything
    // else stay real, so the HTTP round trips keep working under fake time.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  }

  it("closes a session once it has been idle past the TTL", async () => {
    useFakeSweepTimers();
    try {
      const { url } = await startServer({ sessionTtlSeconds: 60 });
      const init = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
      expect(init.status).toBe(200);
      const sessionId = init.headers["mcp-session-id"] as string;
      expect(sessionId).toBeTruthy();

      vi.advanceTimersByTime(91_000);

      const post = await rawRequest(url, {
        headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      });
      expect(post.status).toBe(404);
      expect(JSON.parse(post.body).error).toBe("Session not found");

      // The sweep removed the session itself: a DELETE answers the handler's
      // own Unknown session error without ever reaching a transport.
      const del = await rawRequest(url, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId!, host: url.host },
      });
      expect(del.status).toBe(404);
      expect(JSON.parse(del.body).error).toBe("Unknown session");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a session idle for exactly the TTL, closes it past the TTL", async () => {
    useFakeSweepTimers();
    try {
      const { url } = await startServer({ sessionTtlSeconds: 60 });
      const init = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
      expect(init.status).toBe(200);
      const sessionId = init.headers["mcp-session-id"] as string;

      // t=60s: the sweep fires with exactly 60s of idle. The strictly
      // past-TTL rule keeps the session, and the POST below (which also
      // refreshes the clock) proves it answered.
      vi.advanceTimersByTime(60_000);
      const atTtl = await rawRequest(url, {
        headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      });
      expect(atTtl.status).toBe(200);

      // Clock is now t=60. Sweeps at t=90 (30s idle) and t=120 (60s idle)
      // survive, the t=150 sweep sees 90s idle and closes the session.
      vi.advanceTimersByTime(91_000);
      const pastTtl = await rawRequest(url, {
        headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
      });
      expect(pastTtl.status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an active session alive: idle counts from the last request", async () => {
    useFakeSweepTimers();
    try {
      const { url } = await startServer({ sessionTtlSeconds: 60 });
      const init = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
      expect(init.status).toBe(200);
      const sessionId = init.headers["mcp-session-id"] as string;

      // A request at t=45s refreshes lastSeen, so the sweeps at t=60s and
      // t=90s see 15s and 45s of idle. By t=95s the session is 95s old but
      // only 50s idle, well inside the TTL, and it must still answer.
      vi.advanceTimersByTime(45_000);
      const mid = await rawRequest(url, {
        headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      });
      expect(mid.status).toBe(200);

      vi.advanceTimersByTime(50_000);
      const late = await rawRequest(url, {
        headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
      });
      expect(late.status).toBe(200);
      expect(late.body).toContain('"result"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the DELETE path working: the session stays gone afterwards", async () => {
    const { url } = await startServer({ sessionTtlSeconds: 60 });

    const init = await rawRequest(url, { headers: { ...JSON_HEADERS }, body: INITIALIZE });
    expect(init.status).toBe(200);
    const sessionId = init.headers["mcp-session-id"] as string;

    const del = await rawRequest(url, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId!, host: url.host },
    });
    expect(del.status).toBe(200);

    const post = await rawRequest(url, {
      headers: { ...JSON_HEADERS, "mcp-session-id": sessionId!, host: url.host },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(post.status).toBe(404);
    expect(JSON.parse(post.body).error).toBe("Session not found");
  });

  it("clears the idle sweep timer when the server closes", async () => {
    useFakeSweepTimers();
    try {
      const baseline = vi.getTimerCount();
      const entry = await startServer({ sessionTtlSeconds: 60 });
      // startServer registers every server for afterAll teardown. This test
      // closes its own, so take it off that list and close the mock API too.
      started.splice(started.indexOf(entry), 1);
      expect(vi.getTimerCount()).toBe(baseline + 1);

      await entry.server.close();
      await entry.api.close();
      expect(vi.getTimerCount()).toBe(baseline);
    } finally {
      vi.useRealTimers();
    }
  });
});
