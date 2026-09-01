import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import type { SignalConfig } from "./config.js";
import type { SignalClient } from "./signal-client.js";
import { registerTools } from "./tools/index.js";
import type { ToolDeps } from "./tools/util.js";

export const SERVER_NAME = "signal-api-mcp";
export const SERVER_VERSION = pkg.version;

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
    disabledTools: config.disabledTools,
  };
  registerTools(server, deps);
  return server;
}
