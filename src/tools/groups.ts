import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fail, missingNumberError, ok, resolveNumber, type ToolDeps } from "./util.js";

export function registerListGroups(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "list_groups",
    {
      title: "List Signal groups",
      description:
        "List all groups an account is a member of. Returns an array of group objects (id, name, description, members, ...).",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number to list groups for. Defaults to SIGNAL_NUMBER."),
      },
    },
    async ({ number }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.listGroups({ number: account });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerGetGroup(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "get_group",
    {
      title: "Get a Signal group",
      description: "Fetch the details of a single group (id, name, description, members, ...).",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number that is a member of the group. Defaults to SIGNAL_NUMBER."),
        group_id: z.string().describe("The group ID to fetch."),
      },
    },
    async ({ number, group_id }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.getGroup({ number: account, groupId: group_id });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerCreateGroup(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "create_group",
    {
      title: "Create a Signal group",
      description:
        "Create a new group on behalf of an account. Returns the new group's ID, which can be used " +
        "as a send recipient.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number that will own the group. Defaults to SIGNAL_NUMBER."),
        name: z.string().min(1).describe("Group name."),
        members: z
          .array(z.string())
          .min(1)
          .describe("Initial group members (phone numbers). The owner is added automatically."),
        description: z.string().optional().describe("Optional group description."),
      },
    },
    async ({ number, name, members, description }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.createGroup({
          number: account,
          name,
          members,
          description,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerUpdateGroup(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "update_group",
    {
      title: "Update a Signal group",
      description:
        "Update the name and/or description of an existing group. Only provided fields are changed.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number that is a member of the group. Defaults to SIGNAL_NUMBER."),
        group_id: z.string().describe("The group ID to update."),
        name: z.string().optional().describe("New group name."),
        description: z.string().optional().describe("New group description."),
      },
    },
    async ({ number, group_id, name, description }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.updateGroup({
          number: account,
          groupId: group_id,
          name,
          description,
        });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}

export function registerDeleteGroup(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "delete_group",
    {
      title: "Delete a Signal group",
      description: "Permanently delete (leave) a group for an account.",
      inputSchema: {
        number: z
          .string()
          .optional()
          .describe("Account phone number that is a member of the group. Defaults to SIGNAL_NUMBER."),
        group_id: z.string().describe("The group ID to delete."),
      },
    },
    async ({ number, group_id }) => {
      const account = resolveNumber(number, deps.defaultNumber);
      if (!account) return missingNumberError();
      try {
        const result = await deps.client.deleteGroup({ number: account, groupId: group_id });
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    },
  );
}
