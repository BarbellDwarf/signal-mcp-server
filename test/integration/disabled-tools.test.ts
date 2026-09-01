import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import {
  callToolJson,
  listToolNames,
  type McpClientHandle,
} from "../helpers/mcp-client.js";

/** Full set of tool names the server registers when nothing is disabled. */
const ALL_TOOLS = [
  "create_group",
  "delete_group",
  "get_about",
  "get_group",
  "get_health",
  "link_device_qrcode",
  "list_accounts",
  "list_contacts",
  "list_groups",
  "receive_messages",
  "register_number",
  "send_message",
  "update_group",
  "update_profile",
  "verify_number",
];

describe("SIGNAL_DISABLED_TOOLS", () => {
  describe("with register_number and verify_number disabled", () => {
    let api: MockSignalApiHandle;
    let handle: McpClientHandle;

    beforeAll(async () => {
      api = await startMockSignalApi();
      handle = await setupServerAndClient(api.url, {
        signalNumber: "+15551234567",
        disabledTools: ["register_number", "verify_number"],
      });
    });

    afterAll(async () => {
      await handle.close();
      await api.close();
    });

    it("excludes the disabled tools from tools/list", async () => {
      const names = await listToolNames(handle.client);
      expect(names).not.toContain("register_number");
      expect(names).not.toContain("verify_number");
    });

    it("still lists all other tools", async () => {
      const names = await listToolNames(handle.client);
      const expected = ALL_TOOLS.filter(
        (n) => n !== "register_number" && n !== "verify_number",
      );
      expect(names).toEqual(expected);
    });

    it("still allows calling a non-disabled tool", async () => {
      const result = (await callToolJson(handle.client, "get_about")) as {
        version: string;
      };
      expect(result.version).toBe("0.13.0");
    });
  });

  describe("with no SIGNAL_DISABLED_TOOLS", () => {
    let api: MockSignalApiHandle;
    let handle: McpClientHandle;

    beforeAll(async () => {
      api = await startMockSignalApi();
      handle = await setupServerAndClient(api.url, {
        signalNumber: "+15551234567",
      });
    });

    afterAll(async () => {
      await handle.close();
      await api.close();
    });

    it("registers every tool", async () => {
      const names = await listToolNames(handle.client);
      expect(names).toEqual(ALL_TOOLS);
    });
  });

  describe("with an unknown tool name", () => {
    let api: MockSignalApiHandle;
    let handle: McpClientHandle;
    let warnCalls: unknown[][];

    beforeAll(async () => {
      api = await startMockSignalApi();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        handle = await setupServerAndClient(api.url, {
          signalNumber: "+15551234567",
          disabledTools: ["bogus_tool"],
        });
        warnCalls = warnSpy.mock.calls.map((c) => [...c]);
      } finally {
        warnSpy.mockRestore();
      }
    });

    afterAll(async () => {
      await handle.close();
      await api.close();
    });

    it("warns about the unknown name and still starts", async () => {
      const warningTexts = warnCalls.map((args) => String(args[0]));
      expect(warningTexts).toEqual(
        expect.arrayContaining([expect.stringContaining("bogus_tool")]),
      );
      const names = await listToolNames(handle.client);
      expect(names).not.toContain("bogus_tool");
      expect(names).toEqual(ALL_TOOLS);
    });

    it("warns only once per process, not per server instance", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        // A second server instance (the HTTP transport builds one per session)
        // with a different unknown name must not produce a second warning.
        const second = await setupServerAndClient(api.url, {
          signalNumber: "+15551234567",
          disabledTools: ["another_bogus_tool"],
        });
        const names = await listToolNames(second.client);
        expect(names).toEqual(ALL_TOOLS);
        await second.close();
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
