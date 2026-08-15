import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok, type ToolDeps } from "./util.js";

export function registerListAccounts(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "list_accounts",
    {
      title: "List Signal accounts",
      description:
        "List all Signal accounts (phone numbers) currently registered in the linked signal-cli-rest-api instance.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await deps.client.listAccounts();
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
