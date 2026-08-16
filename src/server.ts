import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SignalConfig } from "./config.js";
import type { SignalClient } from "./signal-client.js";
import { registerTools } from "./tools/index.js";
import type { ToolDeps } from "./tools/util.js";

export const SERVER_NAME = "signal-mcp-server";
export const SERVER_VERSION = "0.1.0";

/** Build the McpServer with every tool registered, wired to the given client. */
export function createSignalMcpServer(client: SignalClient, config: SignalConfig): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  const deps: ToolDeps = {
    client,
    defaultNumber: config.signalNumber,
    allowedRecipients: config.allowedRecipients,
  };
  registerTools(server, deps);
  return server;
}
