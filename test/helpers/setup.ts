import type { SignalConfig } from "../../src/config.js";
import { SignalClient } from "../../src/signal-client.js";
import { createSignalMcpServer } from "../../src/server.js";
import { connectInMemory, type McpClientHandle } from "./mcp-client.js";

export interface TestConfigOverrides {
  signalNumber?: string;
  apiToken?: string;
  /** Recipients permitted by SIGNAL_ALLOWED_RECIPIENTS. Empty means unrestricted. */
  allowedRecipients?: string[];
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
    maxBodyBytes: 10485760,
    apiToken: overrides.apiToken,
    logLevel: "error",
    allowedRecipients: new Set(overrides.allowedRecipients ?? []),
  };
  const client = new SignalClient({ baseUrl: apiUrl });
  const server = createSignalMcpServer(client, config);
  return connectInMemory(server);
}
