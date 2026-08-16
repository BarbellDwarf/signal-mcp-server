import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface McpClientHandle {
  client: Client;
  /** Disconnect the client and shut down the server. */
  close(): Promise<void>;
}

/**
 * Connect an in-process MCP Client to an McpServer over an in-memory transport
 * pair, so integration tests can invoke tools without spawning a process.
 */
export async function connectInMemory(server: McpServer): Promise<McpClientHandle> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "signal-mcp-test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  // Connect the server first so the client's initialize handshake is answered.
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

interface TextContentBlock {
  type: string;
  text?: string;
}

/** Extract the first text block from a `tools/call` result. */
export function extractText(result: unknown): string {
  const content = (result as { content?: unknown }).content as TextContentBlock[] | undefined;
  const block = content?.find((candidate) => candidate.type === "text");
  if (!block?.text) {
    throw new Error(`Expected a text content block, got: ${JSON.stringify(result)}`);
  }
  return block.text;
}

/** Call a tool and return its parsed text content. */
export async function callToolJson(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  return JSON.parse(extractText(result));
}

/** List the tool names registered by the server. */
export async function listToolNames(client: Client): Promise<string[]> {
  const tools = await client.listTools();
  return tools.tools.map((tool) => tool.name).sort();
}
