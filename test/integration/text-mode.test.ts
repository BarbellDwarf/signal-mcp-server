import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("send_message text_mode passthrough", () => {
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

  it("carries text_mode in the backend body when provided and omits it when not", async () => {
    const lastSendBody = (): Record<string, unknown> =>
      api.requests
        .filter((request) => request.method === "POST" && request.path === "/v2/send")
        .at(-1)?.body as Record<string, unknown>;

    await callToolJson(handle.client, "send_message", {
      message: "**bold** body",
      recipients: ["+15559876543"],
      text_mode: "styled",
    });
    expect(lastSendBody().text_mode).toBe("styled");

    await callToolJson(handle.client, "send_message", {
      message: "plain body",
      recipients: ["+15559876543"],
    });
    expect(lastSendBody()).not.toHaveProperty("text_mode");
  });
});
