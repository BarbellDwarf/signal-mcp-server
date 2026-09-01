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

type RegisterFn = (server: McpServer, deps: ToolDeps) => void;

/** Set once the first unknown SIGNAL_DISABLED_TOOLS name has been reported. */
let warnedUnknownTools = false;

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

/** Every tool name this server knows about, derived from the registry. */
const ALL_TOOL_NAMES: ReadonlySet<string> = new Set(TOOL_ENTRIES.map(([name]) => name));

/** Register every non-disabled tool on the MCP server. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  for (const [name, register] of TOOL_ENTRIES) {
    if (deps.disabledTools?.has(name)) continue;

    register(server, deps);
  }

  // Warn about unknown names in the disabled list so operators catch typos
  // without the server refusing to start. The warning fires once per process:
  // in HTTP mode every session builds its own server, so an unconditional warn
  // would repeat on every session. console.warn writes to stderr, which is
  // safe for the stdio transport where stdout carries JSON-RPC traffic.
  if (deps.disabledTools && !warnedUnknownTools) {
    const unknown = [...deps.disabledTools].filter((name) => !ALL_TOOL_NAMES.has(name));
    if (unknown.length > 0) {
      console.warn(`SIGNAL_DISABLED_TOOLS: unknown tool names ignored: ${unknown.join(", ")}`);
      warnedUnknownTools = true;
    }
  }
}
