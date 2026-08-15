import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

export function registerSendMessage(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "send_message",
    {
      title: "Send a Signal message",
      description:
        "Send a text message to one or more Signal recipients (phone numbers or group IDs). " +
        "Optionally attach base64-encoded files (base64_attachments) and a link preview (link_preview). " +
        "Returns the message timestamp. When some recipients could not be reached, the result includes " +
        "errors.recipients mapping each failed recipient to its error messages.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Sender account phone number in international format. Defaults to SIGNAL_NUMBER."),
        message: z.string().describe("The text body of the message to send."),
        recipients: z
          .array(z.string())
          .min(1)
          .describe("Recipient phone numbers and/or group IDs to send the message to."),
        base64_attachments: z
          .array(z.string())
          .optional()
          .describe("Optional list of base64-encoded file attachments to send."),
        link_preview: z
          .object({
            url: z.string().url().describe("URL to preview."),
            title: z.string().optional().describe("Optional title override for the preview."),
            image: z.string().optional().describe("Optional image data (base64) for the preview."),
          })
          .optional()
          .describe("Optional link preview to attach to the message."),
      },
    },
    async ({ number, message, recipients, base64_attachments, link_preview }) => {
      const sender = resolveNumber(number, deps.defaultNumber);
      if (!sender) return missingNumberError();
      try {
        const result = await deps.client.sendMessage({
          number: sender,
          message,
          recipients,
          base64Attachments: base64_attachments,
          linkPreview: link_preview,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
