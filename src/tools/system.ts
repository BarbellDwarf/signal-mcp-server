import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok, type ToolDeps } from "./util.js";

export function registerGetAbout(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_about",
    {
      title: "Get signal-cli-rest-api version info",
      description:
        "Fetch version information about the underlying signal-cli-rest-api instance " +
        "(e.g. { version, latestVersion }).",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await deps.client.getAbout();
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerGetHealth(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_health",
    {
      title: "Get signal-cli-rest-api health status",
      description:
        "Fetch the health status of the underlying signal-cli-rest-api instance " +
        "(e.g. { status: \"ok\" }).",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await deps.client.getHealth();
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
