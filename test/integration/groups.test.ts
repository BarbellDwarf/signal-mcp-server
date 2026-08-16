import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockSignalApi, type MockSignalApiHandle } from "../helpers/mock-signal-api.js";
import { setupServerAndClient } from "../helpers/setup.js";
import { callToolJson, listToolNames, type McpClientHandle } from "../helpers/mcp-client.js";

describe("group tools against the mock Signal API", () => {
  let api: MockSignalApiHandle;
  let handle: McpClientHandle;

  beforeAll(async () => {
    api = await startMockSignalApi();
    handle = await setupServerAndClient(api.url, { signalNumber: "+15551234567" });
  });

  afterAll(async () => {
    await handle.close();
    await api.close();
  });

  it("exposes the group tools", async () => {
    const tools = await listToolNames(handle.client);
    for (const tool of [
      "list_groups",
      "get_group",
      "create_group",
      "update_group",
      "delete_group",
    ]) {
      expect(tools).toContain(tool);
    }
  });

  it("list_groups hits /v1/groups/{number}", async () => {
    const result = (await callToolJson(handle.client, "list_groups")) as Array<{ name: string }>;
    expect(result).toEqual([{ id: "group-1", name: "Family", members: ["+15551234567"] }]);

    const request = api.requests.find(
      (candidate) => candidate.method === "GET" && candidate.path === "/v1/groups/%2B15551234567",
    );
    expect(request).toBeDefined();
  });

  it("get_group hits /v1/groups/{number}/{groupId}", async () => {
    const result = (await callToolJson(handle.client, "get_group", {
      group_id: "group-1",
    })) as { id: string };
    expect(result.id).toBe("group-1");

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "GET" && candidate.path === "/v1/groups/%2B15551234567/group-1",
    );
    expect(request).toBeDefined();
  });

  it("create_group POSTs the payload and returns the new id", async () => {
    const result = (await callToolJson(handle.client, "create_group", {
      name: "Book Club",
      members: ["+15559876543"],
      description: "monthly reads",
    })) as { id: string };
    expect(result.id).toBe("group-new");

    const request = api.requests.find(
      (candidate) => candidate.method === "POST" && candidate.path === "/v1/groups/%2B15551234567",
    );
    expect(request?.body).toEqual({
      name: "Book Club",
      members: ["+15559876543"],
      description: "monthly reads",
    });
  });

  it("update_group PUTs only the provided fields", async () => {
    const result = (await callToolJson(handle.client, "update_group", {
      group_id: "group-1",
      description: "updated description",
    })) as { updated: boolean };
    expect(result.updated).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "PUT" && candidate.path === "/v1/groups/%2B15551234567/group-1",
    );
    expect(request?.body).toEqual({ description: "updated description" });
  });

  it("delete_group sends DELETE for the group", async () => {
    const result = (await callToolJson(handle.client, "delete_group", {
      group_id: "group-1",
    })) as { deleted: boolean };
    expect(result.deleted).toBe(true);

    const request = api.requests.find(
      (candidate) =>
        candidate.method === "DELETE" && candidate.path === "/v1/groups/%2B15551234567/group-1",
    );
    expect(request).toBeDefined();
  });
});
