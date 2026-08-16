import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

export function registerReceiveMessages(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "receive_messages",
    {
      title: "Receive Signal messages",
      description:
        "Poll and receive messages for an account. Returns an array of { account, envelope } entries " +
        "containing incoming data/sync/receipt/typing messages. This is a polling receive: it returns " +
        "whatever is currently queued for the account (or waits up to `timeout` seconds).",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number to receive for. Defaults to SIGNAL_NUMBER."),
        timeout: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("How long to wait for a message, in seconds (default: backend default)."),
      },
    },
    async ({ number, timeout }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.receiveMessages({ number: account, timeout });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
