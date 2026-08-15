import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

export function registerListContacts(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "list_contacts",
    {
      title: "List Signal contacts",
      description:
        "List the known contacts of an account (includes non-contacts the account has interacted with). " +
        "Returns an array of { number, name, ... } entries.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number to list contacts for. Defaults to SIGNAL_NUMBER."),
      },
    },
    async ({ number }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.listContacts({ number: account });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
