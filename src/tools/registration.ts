import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok, type ToolDeps } from "./util.js";

export function registerRegisterNumber(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "register_number",
    {
      title: "Register a Signal number",
      description:
        "Register a phone number with Signal. Requests an SMS (or voice) verification code. " +
        "Follow up with verify_number using the received token.",
      inputSchema: {
        number: z
          .string()
          .describe("The phone number to register, in international format."),
        use_voice: z
          .boolean()
          .optional()
          .describe("Request the verification code via voice call instead of SMS."),
        captcha: z
          .string()
          .optional()
          .describe("A captcha token, required by Signal for some registrations."),
      },
    },
    async ({ number, use_voice, captcha }) => {
      try {
        const result = await deps.client.registerNumber({ number, useVoice: use_voice, captcha });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerVerifyNumber(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "verify_number",
    {
      title: "Verify a Signal number",
      description:
        "Verify a phone number with the verification token received after register_number. " +
        "Optionally provide the registration lock PIN.",
      inputSchema: {
        number: z
          .string()
          .describe("The phone number being verified, in international format."),
        token: z.string().describe("The verification token received via SMS or voice call."),
        pin: z
          .string()
          .optional()
          .describe("Registration lock PIN, if the number has one set."),
      },
    },
    async ({ number, token, pin }) => {
      try {
        const result = await deps.client.verifyNumber({ number, token, pin });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
