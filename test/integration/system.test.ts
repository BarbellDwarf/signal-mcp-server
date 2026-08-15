import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("system tools against the mock Signal API", () => {
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

  it("get_about returns the backend version", async () => {
    const result = (await callToolJson(handle.client, "get_about")) as { version: string };
    expect(result.version).toBe("0.13.0");
  });

  it("get_health returns the backend health", async () => {
    const result = (await callToolJson(handle.client, "get_health")) as { status: string };
    expect(result.status).toBe("ok");
  });

  it("uses SIGNAL_NUMBER as the default for tools that need a number", async () => {
    await callToolJson(handle.client, "list_groups");
    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/groups/%2B15551234567",
    );
    expect(request).toBeDefined();
  });

  it("an explicit number overrides SIGNAL_NUMBER", async () => {
    await callToolJson(handle.client, "list_groups", { number: "+15550001111" });
    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/groups/%2B15550001111",
    );
    expect(request).toBeDefined();
  });

  it("returns a structured error when the backend is unreachable", async () => {
    const deadApi = await startMockSignalApi();
    await deadApi.close();
    const deadHandle = await setupServerAndClient(deadApi.url);
    try {
      const result = (await callToolJson(deadHandle.client, "get_health")) as {
        error: { message: string };
      };
      expect(result.error.message).toMatch(/failed to reach signal-cli-rest-api/i);
    } finally {
      await deadHandle.close();
    }
  });

  it("returns a structured error for backend 5xx responses", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "GET",
          pathPattern: /^\/v1\/health$/,
          handler: () => ({ status: 500, body: { error: "internal failure" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url);
    try {
      const result = (await callToolJson(brokenHandle.client, "get_health")) as {
        error: { status: number; message: string };
      };
      expect(result.error.status).toBe(500);
      expect(result.error.message).toContain("internal failure");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });
});
