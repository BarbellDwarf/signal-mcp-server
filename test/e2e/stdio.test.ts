import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { extractText } from "../helpers/mcp-client.js";
import { DIST_PATH } from "../helpers/spawn.js";
import pkg from "../../package.json" with { type: "json" };

const EXPECTED_TOOLS = [
  "send_message",
  "receive_messages",
  "list_accounts",
  "list_contacts",
  "list_groups",
  "get_group",
  "create_group",
  "update_group",
  "delete_group",
  "update_profile",
  "register_number",
  "verify_number",
  "link_device_qrcode",
  "get_about",
  "get_health",
];

describe("e2e over stdio (real server bundle, real MCP client)", () => {
  let api: MockSignalApiHandle;
  let transport: StdioClientTransport;
  let client: Client;
  let stderrOutput = "";

  beforeAll(async () => {
    api = await startMockSignalApi();
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_PATH],
      env: {
        ...process.env,
        SIGNAL_API_URL: api.url,
        SIGNAL_NUMBER: "+15551234567",
        SIGNAL_TRANSPORT: "stdio",
        LOG_LEVEL: "debug",
      },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      stderrOutput += String(chunk);
    });
    client = new Client({ name: "e2e-stdio-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await transport.close();
    await api.close();
  });

  it("advertises all expected tools", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("logs startup info to stderr (stdout stays clean for the protocol)", async () => {
    expect(stderrOutput).toContain("signal-api-mcp started");
    expect(stderrOutput).toContain('"transport":"stdio"');
  });

  it("reports its identity from the package metadata", async () => {
    const info = client.getServerVersion();
    expect(info?.name).toBe("signal-api-mcp");
    expect(info?.version).toBe(pkg.version);
  });

  it("calls send_message end-to-end through the mock backend", async () => {
    const result = await client.callTool({
      name: "send_message",
      arguments: { message: "e2e hello", recipients: ["+15559876543"] },
    });
    const parsed = JSON.parse(extractText(result));
    expect(parsed.timestamp).toBe(1700000000);

    const send = api.requests.find(
      (request) => request.method === "POST" && request.path === "/v2/send",
    );
    expect(send?.body).toEqual({
      number: "+15551234567",
      message: "e2e hello",
      recipients: ["+15559876543"],
    });
  });

  it("uses the configured default number and forwards the timeout", async () => {
    const result = await client.callTool({
      name: "receive_messages",
      arguments: { timeout: 5 },
    });
    expect(JSON.parse(extractText(result))).toEqual([]);

    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/receive/%2B15551234567",
    );
    expect(request).toBeDefined();
    expect(request?.query.timeout).toBe("5");
  });

  it("calls get_health successfully", async () => {
    const result = await client.callTool({ name: "get_health", arguments: {} });
    expect(JSON.parse(extractText(result))).toEqual({ status: "ok" });
  });

  it("returns a structured error when a number is missing", async () => {
    const noDefaultTransport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_PATH],
      env: { ...process.env, SIGNAL_API_URL: api.url, SIGNAL_TRANSPORT: "stdio", LOG_LEVEL: "error" },
      stderr: "pipe",
    });
    const noDefaultClient = new Client(
      { name: "e2e-stdio-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await noDefaultClient.connect(noDefaultTransport);
    try {
      const result = await noDefaultClient.callTool({
        name: "list_groups",
        arguments: {},
      });
      const parsed = JSON.parse(extractText(result));
      expect(parsed.error.message).toContain("SIGNAL_NUMBER");
    } finally {
      await noDefaultClient.close();
      await noDefaultTransport.close();
    }
  });
});
