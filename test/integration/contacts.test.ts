import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("list_contacts against the mock Signal API", () => {
  let api: MockSignalApiHandle;
  let handle: McpClientHandle;

  beforeAll(async () => {
    api = await startMockSignalApi();
    handle = await setupServerAndClient(api.url, { signalNumber: "+15551234567" });
  });

  afterAll(async () => {
    await handle.close();
    await api.close();
  });

  it("returns the mock contact array", async () => {
    const result = (await callToolJson(handle.client, "list_contacts")) as Array<{
      number: string;
      name: string;
    }>;
    expect(result).toEqual([{ number: "+15551234567", name: "Alice" }]);
  });

  it("defaults to SIGNAL_NUMBER when no number is provided", async () => {
    await callToolJson(handle.client, "list_contacts");
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "GET" && candidate.path === "/v1/contacts/%2B15551234567",
    );
    expect(request).toBeDefined();
  });

  it("sends all_recipients=true in the query string", async () => {
    await callToolJson(handle.client, "list_contacts");
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "GET" && candidate.path === "/v1/contacts/%2B15551234567",
    );
    expect(request?.query.all_recipients).toBe("true");
  });

  it("an explicit number overrides SIGNAL_NUMBER", async () => {
    await callToolJson(handle.client, "list_contacts", { number: "+15559876543" });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "GET" && candidate.path === "/v1/contacts/%2B15559876543",
    );
    expect(request).toBeDefined();
    expect(request?.query.all_recipients).toBe("true");
  });

  it("returns a structured error when the backend returns non-2xx", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "GET",
          pathPattern: /^\/v1\/contacts\/[^/]+$/,
          handler: () => ({ status: 404, body: { error: "account not found" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url, {
      signalNumber: "+15551234567",
    });
    try {
      const result = (await callToolJson(brokenHandle.client, "list_contacts")) as {
        error: { status: number; message: string };
      };
      expect(result.error.status).toBe(404);
      expect(result.error.message).toContain("account not found");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });
});
