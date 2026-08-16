import { afterEach, describe, expect, it, vi } from "vitest";
import { SignalClient } from "../../src/signal-client.js";
import { SignalApiError } from "../../src/types.js";

const BASE_URL = "http://signal.test:8080";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetchOnce(status: number, body: unknown): FetchCall {
  const call: FetchCall = { url: "" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      call.url = String(input);
      call.init = init;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return call;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignalClient", () => {
  const client = new SignalClient({ baseUrl: BASE_URL });

  describe("sendMessage", () => {
    it("POSTs /v2/send with camelCase mapped to snake_case", async () => {
      const call = mockFetchOnce(200, { timestamp: 123 });
      await client.sendMessage({
        number: "+15551234567",
        message: "hello",
        recipients: ["+15559876543", "group-id-1"],
        base64Attachments: ["QUJD"],
        linkPreview: { url: "https://example.com", title: "Example" },
      });

      expect(call.url).toBe(`${BASE_URL}/v2/send`);
      expect(call.init?.method).toBe("POST");
      const body = JSON.parse(String(call.init?.body));
      expect(body).toEqual({
        number: "+15551234567",
        message: "hello",
        recipients: ["+15559876543", "group-id-1"],
        base64_attachments: ["QUJD"],
        link_preview: { url: "https://example.com", title: "Example" },
      });
    });

    it("omits optional fields when not provided", async () => {
      const call = mockFetchOnce(200, { timestamp: 1 });
      await client.sendMessage({ number: "n", message: "m", recipients: ["r"] });
      const body = JSON.parse(String(call.init?.body));
      expect(body).toEqual({ number: "n", message: "m", recipients: ["r"] });
      expect(body.base64_attachments).toBeUndefined();
      expect(body.link_preview).toBeUndefined();
    });
  });

  describe("receiveMessages", () => {
    it("GETs /v1/receive/{number} with URL-encoded path and timeout query", async () => {
      const call = mockFetchOnce(200, []);
      await client.receiveMessages({ number: "+15551234567", timeout: 30 });
      expect(call.url).toBe(`${BASE_URL}/v1/receive/%2B15551234567?timeout=30`);
      expect(call.init?.method).toBe("GET");
    });

    it("omits the timeout query when not provided", async () => {
      const call = mockFetchOnce(200, []);
      await client.receiveMessages({ number: "n" });
      expect(call.url).toBe(`${BASE_URL}/v1/receive/n`);
    });
  });

  describe("read endpoints", () => {
    it("listAccounts GETs /v1/accounts", async () => {
      const call = mockFetchOnce(200, ["+1", "+2"]);
      await client.listAccounts();
      expect(call.url).toBe(`${BASE_URL}/v1/accounts`);
      expect(call.init?.method).toBe("GET");
    });

    it("listContacts adds all_recipients=true", async () => {
      const call = mockFetchOnce(200, []);
      await client.listContacts({ number: "+15551234567" });
      expect(call.url).toBe(`${BASE_URL}/v1/contacts/%2B15551234567?all_recipients=true`);
    });

    it("listGroups / getGroup build the right paths", async () => {
      const listCall = mockFetchOnce(200, []);
      await client.listGroups({ number: "n" });
      expect(listCall.url).toBe(`${BASE_URL}/v1/groups/n`);

      const getCall = mockFetchOnce(200, {});
      await client.getGroup({ number: "n", groupId: "g" });
      expect(getCall.url).toBe(`${BASE_URL}/v1/groups/n/g`);
    });
  });

  describe("write endpoints", () => {
    it("createGroup POSTs name/members/description", async () => {
      const call = mockFetchOnce(200, { id: "g" });
      await client.createGroup({ number: "n", name: "G", members: ["a"], description: "d" });
      expect(call.init?.method).toBe("POST");
      expect(JSON.parse(String(call.init?.body))).toEqual({
        name: "G",
        members: ["a"],
        description: "d",
      });
    });

    it("updateGroup only includes provided fields", async () => {
      const call = mockFetchOnce(200, {});
      await client.updateGroup({ number: "n", groupId: "g", name: "New" });
      expect(JSON.parse(String(call.init?.body))).toEqual({ name: "New" });
    });

    it("deleteGroup sends DELETE", async () => {
      const call = mockFetchOnce(200, {});
      await client.deleteGroup({ number: "n", groupId: "g" });
      expect(call.init?.method).toBe("DELETE");
    });

    it("updateProfile maps base64Avatar to base64_avatar", async () => {
      const call = mockFetchOnce(200, {});
      await client.updateProfile({ number: "n", name: "N", about: "A", base64Avatar: "AV" });
      expect(JSON.parse(String(call.init?.body))).toEqual({
        name: "N",
        about: "A",
        base64_avatar: "AV",
      });
    });

    it("registerNumber maps useVoice to use_voice", async () => {
      const call = mockFetchOnce(200, {});
      await client.registerNumber({ number: "n", useVoice: true });
      expect(JSON.parse(String(call.init?.body))).toEqual({ use_voice: true });
    });

    it("verifyNumber POSTs to /v1/register/{number}/verify/{token}", async () => {
      const call = mockFetchOnce(200, {});
      await client.verifyNumber({ number: "n", token: "t", pin: "1234" });
      expect(call.url).toBe(`${BASE_URL}/v1/register/n/verify/t`);
      expect(JSON.parse(String(call.init?.body))).toEqual({ pin: "1234" });
    });
  });

  describe("getQrCodeLink", () => {
    it("fetches the PNG bytes and returns them base64-encoded", async () => {
      const call: FetchCall = { url: "" };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: Parameters<typeof fetch>[0]) => {
          call.url = String(input);
          return new Response(Buffer.from("PNG-BYTES"), {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }),
      );
      const result = await client.getQrCodeLink({ deviceName: "My Laptop" });
      expect(call.url).toBe(`${BASE_URL}/v1/qrcodelink?device_name=My+Laptop`);
      expect(result).toEqual({ deviceName: "My Laptop", base64Png: "UE5HLUJZVEVT" });
    });
  });

  describe("error mapping", () => {
    it("throws a SignalApiError with status and message for a 4xx error body", async () => {
      mockFetchOnce(400, { error: "Bad stuff happened" });
      const promise = client.getAbout();
      await expect(promise).rejects.toBeInstanceOf(SignalApiError);
      await expect(promise).rejects.toMatchObject({
        status: 400,
        method: "GET",
        url: `${BASE_URL}/v1/about`,
        message: expect.stringContaining("Bad stuff happened"),
      });
    });

    it("captures challenge_tokens on 429 rate limits", async () => {
      mockFetchOnce(429, { error: "rate limited", challenge_tokens: { captcha: "abc" } });
      try {
        await client.getAbout();
        throw new Error("expected an error");
      } catch (error) {
        expect(error).toBeInstanceOf(SignalApiError);
        const apiError = error as SignalApiError;
        expect(apiError.status).toBe(429);
        expect(apiError.challengeTokens).toEqual({ captcha: "abc" });
      }
    });

    it("throws a SignalApiError when the network is unreachable", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      );
      const promise = client.getHealth();
      await expect(promise).rejects.toBeInstanceOf(SignalApiError);
      await expect(promise).rejects.toMatchObject({ message: expect.stringContaining("fetch failed") });
    });
  });
});
