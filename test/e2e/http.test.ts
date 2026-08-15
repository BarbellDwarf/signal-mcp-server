import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { extractText } from "../helpers/mcp-client.js";
import { spawnServer, stopServer, waitForHttpUrl, type SpawnedServer } from "../helpers/spawn.js";

const TOKEN = "test-bearer-token";

describe("e2e over streamable HTTP (real server bundle, real MCP client)", () => {
  let api: MockSignalApiHandle;
  let spawned: SpawnedServer;
  let url: string;
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    api = await startMockSignalApi();
    spawned = spawnServer({
      SIGNAL_API_URL: api.url,
      SIGNAL_NUMBER: "+15551234567",
      SIGNAL_TRANSPORT: "http",
      HOST: "127.0.0.1",
      PORT: "0",
      SIGNAL_API_TOKEN: TOKEN,
      LOG_LEVEL: "info",
    });
    url = await waitForHttpUrl(spawned);

    transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    });
    client = new Client({ name: "e2e-http-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
    await transport.close();
    await stopServer(spawned);
    await api.close();
  });

  it("rejects requests without a bearer token", async () => {
    const unauthorizedTransport = new StreamableHTTPClientTransport(new URL(url));
    const unauthorizedClient = new Client(
      { name: "e2e-http-unauth", version: "1.0.0" },
      { capabilities: {} },
    );
    await expect(unauthorizedClient.connect(unauthorizedTransport)).rejects.toThrow();
    await unauthorizedClient.close();
  });

  it("advertises all expected tools over HTTP", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
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
    ]);
  });

  it("calls tools over HTTP against the mock backend", async () => {
    const about = await client.callTool({ name: "get_about", arguments: {} });
    expect(JSON.parse(extractText(about))).toEqual({
      version: "0.13.0",
      latestVersion: "0.13.0",
    });

    const send = await client.callTool({
      name: "send_message",
      arguments: { message: "over http", recipients: ["+15559876543"] },
    });
    expect(JSON.parse(extractText(send))).toEqual({ timestamp: 1700000000 });

    const request = api.requests.find(
      (candidate) => candidate.method === "POST" && candidate.path === "/v2/send",
    );
    expect(request?.body).toMatchObject({
      number: "+15551234567",
      message: "over http",
      recipients: ["+15559876543"],
    });
  });
});
