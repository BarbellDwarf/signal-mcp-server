import http from "node:http";
import type { Server } from "node:http";

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  body?: unknown;
}

export interface MockSignalApiOptions {
  /** Routes are matched against request path + method to produce responses. */
  routes?: Array<{
    method: string;
    pathPattern: RegExp;
    /** Response body (JSON-serializable). Return an object; `status` is optional. */
    handler: (req: RecordedRequest) => { status?: number; body: unknown };
  }>;
}

export interface MockSignalApiHandle {
  url: string;
  /** Requests received so far, in order. */
  requests: RecordedRequest[];
  close(): Promise<void>;
}

const DEFAULT_ROUTES: NonNullable<MockSignalApiOptions["routes"]> = [
  { method: "POST", pathPattern: /^\/v2\/send$/, handler: () => ({ body: { timestamp: 1700000000 } }) },
  { method: "GET", pathPattern: /^\/v1\/receive\/[^/]+$/, handler: () => ({ body: [] }) },
  { method: "GET", pathPattern: /^\/v1\/accounts$/, handler: () => ({ body: ["+15551234567", "+15559876543"] }) },
  { method: "GET", pathPattern: /^\/v1\/contacts\/[^/]+$/, handler: () => ({ body: [{ number: "+15551234567", name: "Alice" }] }) },
  { method: "GET", pathPattern: /^\/v1\/groups\/[^/]+$/, handler: () => ({ body: [{ id: "group-1", name: "Family", members: ["+15551234567"] }] }) },
  { method: "GET", pathPattern: /^\/v1\/groups\/[^/]+\/[^/]+$/, handler: () => ({ body: { id: "group-1", name: "Family", members: ["+15551234567"] } }) },
  { method: "POST", pathPattern: /^\/v1\/groups\/[^/]+$/, handler: () => ({ body: { id: "group-new" } }) },
  { method: "PUT", pathPattern: /^\/v1\/groups\/[^/]+\/[^/]+$/, handler: () => ({ body: { updated: true } }) },
  { method: "DELETE", pathPattern: /^\/v1\/groups\/[^/]+\/[^/]+$/, handler: () => ({ body: { deleted: true } }) },
  { method: "PUT", pathPattern: /^\/v1\/profiles\/[^/]+$/, handler: () => ({ body: { updated: true } }) },
  { method: "POST", pathPattern: /^\/v1\/register\/[^/]+$/, handler: () => ({ body: { success: true } }) },
  { method: "POST", pathPattern: /^\/v1\/register\/[^/]+\/verify\/[^/]+$/, handler: () => ({ body: { success: true } }) },
  { method: "GET", pathPattern: /^\/v1\/qrcodelink$/, handler: () => ({ body: "PNGDATA" }) },
  { method: "GET", pathPattern: /^\/v1\/about$/, handler: () => ({ body: { version: "0.13.0", latestVersion: "0.13.0" } }) },
  { method: "GET", pathPattern: /^\/v1\/health$/, handler: () => ({ body: { status: "ok" } }) },
];

/**
 * Start an in-process mock of signal-cli-rest-api. Routes can be overridden per
 * test by passing a `routes` array; custom handlers are matched in order and
 * fall back to the defaults.
 */
export function startMockSignalApi(options: MockSignalApiOptions = {}): Promise<MockSignalApiHandle> {
  const requests: RecordedRequest[] = [];
  const routes = [...(options.routes ?? []), ...DEFAULT_ROUTES];

  const server: Server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (query[key] === undefined) {
        query[key] = value;
      } else if (Array.isArray(query[key])) {
        query[key].push(value);
      } else {
        query[key] = [query[key], value];
      }
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      let body: unknown = undefined;
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch {
          body = bodyText;
        }
      }

      const record: RecordedRequest = { method, path: url.pathname, query, body };
      requests.push(record);

      const route = routes.find(
        (candidate) => candidate.method === method && candidate.pathPattern.test(url.pathname),
      );
      const response = route ? route.handler(record) : { status: 404, body: { error: "not found" } };
      const status = response.status ?? 200;

      const headers: Record<string, string> = { "content-type": "application/json" };
      const payload =
        typeof response.body === "string" ? response.body : JSON.stringify(response.body);
      res.writeHead(status, headers);
      res.end(payload);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          }),
      });
    });
  });
}
