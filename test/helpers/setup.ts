import type { SignalConfig } from "../../src/config.js";
import { SignalClient } from "../../src/signal-client.js";
import { createSignalMcpServer } from "../../src/server.js";
import { connectInMemory, type McpClientHandle } from "./mcp-client.js";

export interface TestConfigOverrides {
  signalNumber?: string;
  apiToken?: string;
}

/**
 * Build a real McpServer + SignalClient wired to the given mock API URL and
 * connect an in-process MCP Client to it over an in-memory transport.
 */
export async function setupServerAndClient(
  apiUrl: string,
  overrides: TestConfigOverrides = {},
): Promise<McpClientHandle> {
  const config: SignalConfig = {
    signalApiUrl: apiUrl,
    signalNumber: overrides.signalNumber,
    transport: "stdio",
    host: "127.0.0.1",
    port: 0,
    apiToken: overrides.apiToken,
    logLevel: "error",
  };
  const client = new SignalClient({ baseUrl: apiUrl });
  const server = createSignalMcpServer(client, config);
  return connectInMemory(server);
}
