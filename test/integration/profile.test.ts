import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("update_profile against the mock Signal API", () => {
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

  it("PUTs name, about, and base64_avatar to /v1/profiles/{number}", async () => {
    const result = (await callToolJson(handle.client, "update_profile", {
      name: "Agent",
      about: "a helpful assistant",
      base64_avatar: "QUJD",
    })) as { updated: boolean };
    expect(result.updated).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "PUT" && candidate.path === "/v1/profiles/%2B15551234567",
    );
    expect(request?.body).toEqual({
      name: "Agent",
      about: "a helpful assistant",
      base64_avatar: "QUJD",
    });
  });

  it("defaults to SIGNAL_NUMBER when no number is provided", async () => {
    await callToolJson(handle.client, "update_profile", { name: "Test" });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "PUT" && candidate.path === "/v1/profiles/%2B15551234567",
    );
    expect(request).toBeDefined();
  });

  it("an explicit number overrides SIGNAL_NUMBER", async () => {
    await callToolJson(handle.client, "update_profile", {
      number: "+15559876543",
      name: "Other",
    });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "PUT" && candidate.path === "/v1/profiles/%2B15559876543",
    );
    expect(request).toBeDefined();
  });

  it("omits undefined optionals from the request body", async () => {
    await callToolJson(handle.client, "update_profile", { name: "Name Only" });
    const requests = api.requests.filter(
      (candidate) =>
        candidate.method === "PUT" && candidate.path === "/v1/profiles/%2B15551234567",
    );
    const request = requests.at(-1);
    expect(request?.body).toEqual({ name: "Name Only" });
    expect(request?.body).not.toHaveProperty("about");
    expect(request?.body).not.toHaveProperty("base64_avatar");
  });

  it("returns a structured error when the backend returns non-2xx", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "PUT",
          pathPattern: /^\/v1\/profiles\/[^/]+$/,
          handler: () => ({ status: 500, body: { error: "database timeout" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url, {
      signalNumber: "+15551234567",
    });
    try {
      const result = (await callToolJson(brokenHandle.client, "update_profile", {
        name: "Will Fail",
      })) as { error: { status: number; message: string } };
      expect(result.error.status).toBe(500);
      expect(result.error.message).toContain("database timeout");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });
});
