import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

export function registerUpdateProfile(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "update_profile",
    {
      title: "Update Signal profile",
      description:
        "Update the public profile of an account: display name, about text, and/or avatar image " +
        "(base64-encoded). Only provided fields are changed.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number to update the profile of. Defaults to SIGNAL_NUMBER."),
        name: z.string().optional().describe("New display name."),
        about: z.string().optional().describe("New 'about' text."),
        base64_avatar: z
          .string()
          .optional()
          .describe("New avatar image, base64-encoded."),
      },
    },
    async ({ number, name, about, base64_avatar }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.updateProfile({
          number: account,
          name,
          about,
          base64Avatar: base64_avatar,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
