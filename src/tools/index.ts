import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolDeps } from "./util.js";
import { registerListAccounts } from "./accounts.js";
import { registerListContacts } from "./contacts.js";
import {
  registerCreateGroup,
  registerDeleteGroup,
  registerGetGroup,
  registerListGroups,
  registerUpdateGroup,
} from "./groups.js";
import { registerLinkDeviceQrCode } from "./link.js";
import { registerUpdateProfile } from "./profile.js";
import { registerReceiveMessages } from "./receive-messages.js";
import { registerRegisterNumber, registerVerifyNumber } from "./registration.js";
import { registerSendMessage } from "./send-message.js";
import { registerGetAbout, registerGetHealth } from "./system.js";

/** Every tool name this server knows about, for forward-compatible validation. */
const ALL_TOOL_NAMES: ReadonlySet<string> = new Set([
  "send_message",
  "receive_messages",
  "list_accounts",
  "list_contacts",
  "list_groups",
  "get_group",
  "create_group",
  "update_group",
  "delete_group",
  "update_profile",
  "register_number",
  "verify_number",
  "link_device_qrcode",
  "get_about",
  "get_health",
]);

type RegisterFn = (server: McpServer, deps: ToolDeps) => void;

const TOOL_ENTRIES: ReadonlyArray<[string, RegisterFn]> = [
  ["send_message", registerSendMessage],
  ["receive_messages", registerReceiveMessages],
  ["list_accounts", registerListAccounts],
  ["list_contacts", registerListContacts],
  ["list_groups", registerListGroups],
  ["get_group", registerGetGroup],
  ["create_group", registerCreateGroup],
  ["update_group", registerUpdateGroup],
  ["delete_group", registerDeleteGroup],
  ["update_profile", registerUpdateProfile],
  ["register_number", registerRegisterNumber],
  ["verify_number", registerVerifyNumber],
  ["link_device_qrcode", registerLinkDeviceQrCode],
  ["get_about", registerGetAbout],
  ["get_health", registerGetHealth],
];

/** Register every non-disabled tool on the MCP server. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  for (const [name, register] of TOOL_ENTRIES) {
    if (deps.disabledTools?.has(name)) continue;

    register(server, deps);
  }

  // Warn about unknown names in the disabled list so operators catch typos
  // without the server refusing to start.
  if (deps.disabledTools) {
    for (const name of deps.disabledTools) {
      if (!ALL_TOOL_NAMES.has(name)) {
        // console.warn goes to stderr, which is safe for the stdio transport
        // since stdout is reserved for JSON-RPC traffic.
        console.warn(`SIGNAL_DISABLED_TOOLS: unknown tool "${name}" ignored`);
      }
    }
  }
}
