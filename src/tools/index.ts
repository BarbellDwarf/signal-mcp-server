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

/** Register every tool on the MCP server. */
export function registerTools(server: McpServer, deps: ToolDeps): void {
  registerSendMessage(server, deps);
  registerReceiveMessages(server, deps);
  registerListAccounts(server, deps);
  registerListContacts(server, deps);
  registerListGroups(server, deps);
  registerGetGroup(server, deps);
  registerCreateGroup(server, deps);
  registerUpdateGroup(server, deps);
  registerDeleteGroup(server, deps);
  registerUpdateProfile(server, deps);
  registerRegisterNumber(server, deps);
  registerVerifyNumber(server, deps);
  registerLinkDeviceQrCode(server, deps);
  registerGetAbout(server, deps);
  registerGetHealth(server, deps);
}
