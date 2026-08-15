import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, ok, type ToolDeps } from "./util.js";

export function registerLinkDeviceQrCode(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "link_device_qrcode",
    {
      title: "Get device-link QR code",
      description:
        "Get a QR code (as a base64-encoded PNG) to link a new Signal device to an existing account. " +
        "Scan the QR code in the Signal mobile app (Settings > Linked devices > Link new device). " +
        "Returns { deviceName, base64Png }.",
      inputSchema: {
        device_name: z
          .string()
          .min(1)
          .describe("A short name for the new device, shown in the Signal app."),
      },
    },
    async ({ device_name }) => {
      try {
        const result = await deps.client.getQrCodeLink({ deviceName: device_name });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
