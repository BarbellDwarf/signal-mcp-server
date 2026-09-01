import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("register_number and verify_number against the mock Signal API", () => {
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

  it("register_number POSTs /v1/register/{number} with use_voice and captcha", async () => {
    const result = (await callToolJson(handle.client, "register_number", {
      number: "+15559990000",
      use_voice: true,
      captcha: "captcha-token-abc",
    })) as { success: boolean };
    expect(result.success).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" && candidate.path === "/v1/register/%2B15559990000",
    );
    expect(request?.body).toEqual({ use_voice: true, captcha: "captcha-token-abc" });
  });

  it("register_number omits use_voice and captcha when not provided", async () => {
    await callToolJson(handle.client, "register_number", {
      number: "+15558880000",
    });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" && candidate.path === "/v1/register/%2B15558880000",
    );
    expect(request?.body).toEqual({});
  });

  it("register_number omits captcha when only use_voice is provided", async () => {
    await callToolJson(handle.client, "register_number", {
      number: "+15557770000",
      use_voice: true,
    });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" && candidate.path === "/v1/register/%2B15557770000",
    );
    expect(request?.body).toEqual({ use_voice: true });
    expect(request?.body).not.toHaveProperty("captcha");
  });

  it("verify_number POSTs /verify/{token} with pin in the body", async () => {
    const result = (await callToolJson(handle.client, "verify_number", {
      number: "+15559990000",
      token: "654321",
      pin: "9999",
    })) as { success: boolean };
    expect(result.success).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" &&
        candidate.path === "/v1/register/%2B15559990000/verify/654321",
    );
    expect(request?.body).toEqual({ pin: "9999" });
  });

  it("verify_number sends an empty body when pin is absent", async () => {
    await callToolJson(handle.client, "verify_number", {
      number: "+15558880000",
      token: "111222",
    });
    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" &&
        candidate.path === "/v1/register/%2B15558880000/verify/111222",
    );
    expect(request?.body).toEqual({});
  });

  it("register_number returns a structured error on backend 4xx", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "POST",
          pathPattern: /^\/v1\/register\/[^/]+$/,
          handler: () => ({ status: 400, body: { error: "invalid captcha" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url, {
      signalNumber: "+15551234567",
    });
    try {
      const result = (await callToolJson(brokenHandle.client, "register_number", {
        number: "+15550001111",
      })) as { error: { status: number; message: string } };
      expect(result.error.status).toBe(400);
      expect(result.error.message).toContain("invalid captcha");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });

  it("verify_number returns a structured error on backend 4xx", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "POST",
          pathPattern: /^\/v1\/register\/[^/]+\/verify\/[^/]+$/,
          handler: () => ({ status: 403, body: { error: "token expired" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url, {
      signalNumber: "+15551234567",
    });
    try {
      const result = (await callToolJson(brokenHandle.client, "verify_number", {
        number: "+15550001111",
        token: "bad",
      })) as { error: { status: number; message: string } };
      expect(result.error.status).toBe(403);
      expect(result.error.message).toContain("token expired");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });
});
