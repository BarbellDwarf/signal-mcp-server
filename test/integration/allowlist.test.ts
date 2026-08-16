import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("send_message recipient allowlist", () => {
  let api: MockSignalApiHandle;
  let handle: McpClientHandle;

  beforeAll(async () => {
    api = await startMockSignalApi();
    handle = await setupServerAndClient(api.url, {
      signalNumber: "+15551234567",
      allowedRecipients: ["+15559876543", "group-1"],
    });
  });

  afterAll(async () => {
    await handle.close();
    await api.close();
  });

  it("sends when every recipient is on the allowlist", async () => {
    const requestsBefore = api.requests.length;
    const result = await callToolJson(handle.client, "send_message", {
      message: "Hello",
      recipients: ["+15559876543", "group-1"],
    });
    expect(result).toEqual({ timestamp: 1700000000 });
    expect(api.requests.length).toBeGreaterThan(requestsBefore);

    const send = api.requests.at(-1);
    expect(send?.body).toEqual({
      number: "+15551234567",
      message: "Hello",
      recipients: ["+15559876543", "group-1"],
    });
  });

  it("refuses recipients outside the allowlist and never hits the backend", async () => {
    const requestsBefore = api.requests.length;
    const result = (await callToolJson(handle.client, "send_message", {
      message: "Hello",
      recipients: ["+15559876543", "+19999999999"],
    })) as { error: { message: string } };
    expect(result.error.message).toContain("+19999999999");
    expect(result.error.message).toContain("SIGNAL_ALLOWED_RECIPIENTS");
    expect(api.requests.length).toBe(requestsBefore);
  });

  it("refuses when no recipient is on the allowlist", async () => {
    const requestsBefore = api.requests.length;
    const result = (await callToolJson(handle.client, "send_message", {
      message: "Hello",
      recipients: ["+11111111111"],
    })) as { error: { message: string } };
    expect(result.error.message).toContain("+11111111111");
    expect(api.requests.length).toBe(requestsBefore);
  });

  it("sends without restriction when no allowlist is configured", async () => {
    const openApi = await startMockSignalApi();
    const openHandle = await setupServerAndClient(openApi.url, { signalNumber: "+15551234567" });
    try {
      const result = await callToolJson(openHandle.client, "send_message", {
        message: "Hello",
        recipients: ["+13334445555"],
      });
      expect(result).toEqual({ timestamp: 1700000000 });

      const send = openApi.requests.find(
        (request) => request.method === "POST" && request.path === "/v2/send",
      );
      expect(send).toBeDefined();
      expect(send?.body).toEqual({
        number: "+15551234567",
        message: "Hello",
        recipients: ["+13334445555"],
      });
    } finally {
      await openHandle.close();
      await openApi.close();
    }
  });
});
