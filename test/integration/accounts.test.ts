import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, listToolNames, type McpClientHandle } from "../helpers/mcp-client.js";

describe("account, profile and device-link tools against the mock Signal API", () => {
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

  it("exposes the account/profile/link tools", async () => {
    const tools = await listToolNames(handle.client);
    for (const tool of [
      "list_accounts",
      "list_contacts",
      "update_profile",
      "register_number",
      "verify_number",
      "link_device_qrcode",
    ]) {
      expect(tools).toContain(tool);
    }
  });

  it("list_accounts returns the registered accounts", async () => {
    const result = (await callToolJson(handle.client, "list_accounts")) as string[];
    expect(result).toEqual(["+15551234567", "+15559876543"]);
  });

  it("list_contacts requests all_recipients and returns contacts", async () => {
    const result = (await callToolJson(handle.client, "list_contacts")) as Array<{ name: string }>;
    expect(result).toEqual([{ number: "+15551234567", name: "Alice" }]);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "GET" &&
        candidate.path === "/v1/contacts/%2B15551234567" &&
        candidate.query.all_recipients === "true",
    );
    expect(request).toBeDefined();
  });

  it("update_profile PUTs name/about/avatar to /v1/profiles/{number}", async () => {
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

  it("register_number POSTs /v1/register/{number}", async () => {
    const result = (await callToolJson(handle.client, "register_number", {
      number: "+15559990000",
      use_voice: true,
    })) as { success: boolean };
    expect(result.success).toBe(true);

    const request = api.requests.find(
      (candidate) => candidate.method === "POST" && candidate.path === "/v1/register/%2B15559990000",
    );
    expect(request?.body).toEqual({ use_voice: true });
  });

  it("verify_number POSTs the token and optional pin", async () => {
    const result = (await callToolJson(handle.client, "verify_number", {
      number: "+15559990000",
      token: "123456",
      pin: "9999",
    })) as { success: boolean };
    expect(result.success).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "POST" &&
        candidate.path === "/v1/register/%2B15559990000/verify/123456",
    );
    expect(request?.body).toEqual({ pin: "9999" });
  });

  it("link_device_qrcode returns the QR code PNG as base64", async () => {
    const result = (await callToolJson(handle.client, "link_device_qrcode", {
      device_name: "Agent Desktop",
    })) as { deviceName: string; base64Png: string };
    expect(result.deviceName).toBe("Agent Desktop");
    expect(result.base64Png).toBe(Buffer.from("PNGDATA").toString("base64"));

    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/qrcodelink",
    );
    expect(request?.query.device_name).toBe("Agent Desktop");
  });
});
