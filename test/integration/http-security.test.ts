import http from "node:http";
import { afterAll, describe, expect, it } from "vitest";
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
}

/**
 * Minimal node:http client. fetch refuses to set the Host header, so the
 * DNS rebinding tests below need raw requests with an explicit Host override.
 */
function rawRequest(
  url: URL,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
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
});
