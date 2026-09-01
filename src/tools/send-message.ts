import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

/**
 * Reject a send when any recipient is outside the allowlist. Returns null when
 * sending is unrestricted or every recipient is permitted.
 */
function disallowedRecipients(
  recipients: string[],
  allowedRecipients: Set<string> | undefined,
): string[] {
  if (!allowedRecipients || allowedRecipients.size === 0) return [];
  return recipients.filter((recipient) => !allowedRecipients.has(recipient));
}

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
        text_mode: z
          .enum(["normal", "styled"])
          .optional()
          .describe(
            "Backend text rendering mode. styled applies markdown-style formatting " +
              "(italic, bold, strikethrough, spoiler, monospace) per the signal-cli-rest-api " +
              "contract. Omit for the backend default.",
          ),
      },
    },
    async ({ number, message, recipients, base64_attachments, link_preview, text_mode }) => {
      const sender = resolveNumber(number, deps.defaultNumber);
      if (!sender) return missingNumberError();

      const blocked = disallowedRecipients(recipients, deps.allowedRecipients);
      if (blocked.length > 0) {
        return fail(
          new Error(
            `Recipients not allowed: ${blocked.join(", ")}. ` +
              "SIGNAL_ALLOWED_RECIPIENTS restricts send_message to a fixed allowlist, " +
              "and these recipients are not on it. Ask the user to add them to " +
              "SIGNAL_ALLOWED_RECIPIENTS or to send to an allowed recipient.",
          ),
        );
      }

      try {
        const result = await deps.client.sendMessage({
          number: sender,
          message,
          recipients,
          base64Attachments: base64_attachments,
          linkPreview: link_preview,
          textMode: text_mode,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
