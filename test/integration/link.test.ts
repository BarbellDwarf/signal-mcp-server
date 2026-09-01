import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, type McpClientHandle } from "../helpers/mcp-client.js";

describe("link_device_qrcode against the mock Signal API", () => {
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

  it("calls GET /v1/qrcodelink with device_name in the query string", async () => {
    await callToolJson(handle.client, "link_device_qrcode", {
      device_name: "Agent Desktop",
    });
    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/qrcodelink",
    );
    expect(request).toBeDefined();
    expect(request?.query.device_name).toBe("Agent Desktop");
  });

  it("returns the QR code PNG bytes as base64, matching the mock payload", async () => {
    const result = (await callToolJson(handle.client, "link_device_qrcode", {
      device_name: "Test Device",
    })) as { deviceName: string; base64Png: string };

    expect(result.deviceName).toBe("Test Device");

    const expectedBytes = Buffer.from("PNGDATA");
    const decoded = Buffer.from(result.base64Png, "base64");
    expect(decoded).toEqual(expectedBytes);
  });

  it("returns a structured error when the backend returns non-2xx", async () => {
    const brokenApi = await startMockSignalApi({
      routes: [
        {
          method: "GET",
          pathPattern: /^\/v1\/qrcodelink$/,
          handler: () => ({ status: 503, body: { error: "service unavailable" } }),
        },
      ],
    });
    const brokenHandle = await setupServerAndClient(brokenApi.url, {
      signalNumber: "+15551234567",
    });
    try {
      const result = (await callToolJson(brokenHandle.client, "link_device_qrcode", {
        device_name: "Will Fail",
      })) as { error: { status: number; message: string } };
      expect(result.error.status).toBe(503);
      expect(result.error.message).toContain("service unavailable");
    } finally {
      await brokenHandle.close();
      await brokenApi.close();
    }
  });
});
