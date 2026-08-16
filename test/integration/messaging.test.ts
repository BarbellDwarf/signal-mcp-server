import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, listToolNames, type McpClientHandle } from "../helpers/mcp-client.js";

describe("messaging tools against the mock Signal API", () => {
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

  it("exposes the messaging tools", async () => {
    const tools = await listToolNames(handle.client);
    expect(tools).toContain("send_message");
    expect(tools).toContain("receive_messages");
  });

  it("send_message POSTs to /v2/send and returns the timestamp", async () => {
    const result = await callToolJson(handle.client, "send_message", {
      message: "Hello from the agent",
      recipients: ["+15559876543"],
    });
    expect(result).toEqual({ timestamp: 1700000000 });

    const send = api.requests.find((request) => request.method === "POST" && request.path === "/v2/send");
    expect(send).toBeDefined();
    expect(send?.body).toEqual({
      number: "+15551234567",
      message: "Hello from the agent",
      recipients: ["+15559876543"],
    });
  });

  it("send_message forwards attachments and link preview", async () => {
    await callToolJson(handle.client, "send_message", {
      message: "with stuff",
      recipients: ["+15559876543"],
      base64_attachments: ["QUJD"],
      link_preview: { url: "https://example.com", title: "Ex" },
    });
    const send = api.requests.filter(
      (request) => request.method === "POST" && request.path === "/v2/send",
    ).at(-1);
    expect(send?.body).toMatchObject({
      base64_attachments: ["QUJD"],
      link_preview: { url: "https://example.com", title: "Ex" },
    });
  });

  it("send_message surfaces partial-send errors from the backend", async () => {
    const partialApi = await startMockSignalApi({
      routes: [
        {
          method: "POST",
          pathPattern: /^\/v2\/send$/,
          handler: () => ({
            body: { timestamp: 111, errors: { "+15559876543": ["Recipient not found"] } },
          }),
        },
      ],
    });
    const partialHandle = await setupServerAndClient(partialApi.url, { signalNumber: "+1" });
    try {
      const result = (await callToolJson(partialHandle.client, "send_message", {
        message: "hi",
        recipients: ["+15559876543"],
      })) as { timestamp: number; errors: Record<string, string[]> };
      expect(result.timestamp).toBe(111);
      expect(result.errors?.["+15559876543"]).toEqual(["Recipient not found"]);
    } finally {
      await partialHandle.close();
      await partialApi.close();
    }
  });

  it("send_message returns a structured error on HTTP 429 with challenge_tokens", async () => {
    const limitedApi = await startMockSignalApi({
      routes: [
        {
          method: "POST",
          pathPattern: /^\/v2\/send$/,
          handler: () => ({
            status: 429,
            body: { error: "rate limited", challenge_tokens: { captcha: "tok" } },
          }),
        },
      ],
    });
    const limitedHandle = await setupServerAndClient(limitedApi.url, { signalNumber: "+1" });
    try {
      const result = (await callToolJson(limitedHandle.client, "send_message", {
        message: "hi",
        recipients: ["+15559876543"],
      })) as {
        error: { message: string; status: number; challenge_tokens: Record<string, unknown> };
      };
      expect(result.error.status).toBe(429);
      expect(result.error.message).toContain("rate limited");
      expect(result.error.challenge_tokens).toEqual({ captcha: "tok" });
    } finally {
      await limitedHandle.close();
      await limitedApi.close();
    }
  });

  it("receive_messages returns the received envelopes", async () => {
    const receiveApi = await startMockSignalApi({
      routes: [
        {
          method: "GET",
          pathPattern: /^\/v1\/receive\/[^/]+$/,
          handler: () => ({
            body: [
              {
                account: "+15551234567",
                envelope: {
                  timestamp: 1700000001,
                  source: "+15559876543",
                  sourceName: "Bob",
                  dataMessage: { message: "hello back" },
                },
              },
            ],
          }),
        },
      ],
    });
    const receiveHandle = await setupServerAndClient(receiveApi.url, { signalNumber: "+15551234567" });
    try {
      const result = (await callToolJson(receiveHandle.client, "receive_messages", {
        timeout: 10,
      })) as Array<{ account: string; envelope: { source: string } }>;
      expect(result).toHaveLength(1);
      expect(result[0]?.account).toBe("+15551234567");
      expect(result[0]?.envelope.source).toBe("+15559876543");
    } finally {
      await receiveHandle.close();
      await receiveApi.close();
    }
  });

  it("returns a structured error when no account number is available", async () => {
    const anonymousApi = await startMockSignalApi();
    const anonymousHandle = await setupServerAndClient(anonymousApi.url);
    try {
      const result = (await callToolJson(anonymousHandle.client, "send_message", {
        message: "hi",
        recipients: ["+15559876543"],
      })) as { error: { message: string } };
      expect(result.error.message).toContain("SIGNAL_NUMBER");
    } finally {
      await anonymousHandle.close();
      await anonymousApi.close();
    }
  });
});
