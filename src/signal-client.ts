import {
  SignalApiError,
  type AboutInfo,
  type Contact,
  type CreateGroupInput,
  type CreateGroupResult,
  type Group,
  type HealthInfo,
  type QrCodeLinkResult,
  type ReceivedMessage,
  type SendMessageInput,
  type SendMessageResult,
} from "./types.js";

export interface SignalClientOptions {
  /** Base URL of the signal-cli-rest-api instance. */
  baseUrl: string;
}

interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "application/json",
};

/**
 * Typed HTTP client for signal-cli-rest-api.
 * Uses the global `fetch` (available on Node >= 20). All methods return parsed
 * JSON and throw a typed {@link SignalApiError} on any non-2xx response.
 */
export class SignalClient {
  private readonly baseUrl: string;

  constructor(options: SignalClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  /** Build the full URL, apply query params, and perform the fetch. */
  private async perform(path: string, options: RequestOptions = {}): Promise<Response> {
    const method = options.method ?? "GET";
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = { ...DEFAULT_HEADERS };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, { method, headers, body });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SignalApiError(
        `Failed to reach signal-cli-rest-api at ${url.toString()}: ${detail}`,
        { method, url: url.toString() },
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
      }
      throw new SignalApiError(this.describeError(parsed, response.status), {
        status: response.status,
        method,
        url: url.toString(),
        body: parsed,
      });
    }

    return response;
  }

  private describeError(body: unknown, status: number): string {
    if (body && typeof body === "object") {
      const message = (body as { error?: string }).error;
      if (typeof message === "string" && message.length > 0) {
        return `signal-cli-rest-api returned HTTP ${status}: ${message}`;
      }
    }
    if (typeof body === "string" && body.length > 0) {
      return `signal-cli-rest-api returned HTTP ${status}: ${body}`;
    }
    return `signal-cli-rest-api returned HTTP ${status}`;
  }

  private async requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.perform(path, options);
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  private async requestBytes(path: string, options: RequestOptions = {}): Promise<ArrayBuffer> {
    const response = await this.perform(path, options);
    return response.arrayBuffer();
  }

  /** POST /v2/send */
  sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const { number, message, recipients, base64Attachments, linkPreview, textMode } = input;
    return this.requestJson<SendMessageResult>("/v2/send", {
      method: "POST",
      body: {
        number,
        message,
        recipients,
        ...(base64Attachments !== undefined && base64Attachments.length > 0
          ? { base64_attachments: base64Attachments }
          : {}),
        ...(linkPreview !== undefined ? { link_preview: linkPreview } : {}),
        ...(textMode !== undefined ? { text_mode: textMode } : {}),
      },
    });
  }

  /** GET /v1/receive/{number} */
  receiveMessages(input: { number: string; timeout?: number }): Promise<ReceivedMessage[]> {
    return this.requestJson<ReceivedMessage[]>(
      `/v1/receive/${encodeURIComponent(input.number)}`,
      { query: input.timeout !== undefined ? { timeout: input.timeout } : {} },
    );
  }

  /** GET /v1/accounts */
  listAccounts(): Promise<string[]> {
    return this.requestJson<string[]>("/v1/accounts");
  }

  /** GET /v1/contacts/{number}?all_recipients=true */
  listContacts(input: { number: string }): Promise<Contact[]> {
    return this.requestJson<Contact[]>(`/v1/contacts/${encodeURIComponent(input.number)}`, {
      query: { all_recipients: true },
    });
  }

  /** GET /v1/groups/{number} */
  listGroups(input: { number: string }): Promise<Group[]> {
    return this.requestJson<Group[]>(`/v1/groups/${encodeURIComponent(input.number)}`);
  }

  /** GET /v1/groups/{number}/{groupId} */
  getGroup(input: { number: string; groupId: string }): Promise<Group> {
    return this.requestJson<Group>(
      `/v1/groups/${encodeURIComponent(input.number)}/${encodeURIComponent(input.groupId)}`,
    );
  }

  /** POST /v1/groups/{number} */
  createGroup(input: CreateGroupInput & { number: string }): Promise<CreateGroupResult> {
    const { number, name, members, description } = input;
    return this.requestJson<CreateGroupResult>(`/v1/groups/${encodeURIComponent(number)}`, {
      method: "POST",
      body: {
        name,
        members,
        ...(description !== undefined ? { description } : {}),
      },
    });
  }

  /** PUT /v1/groups/{number}/{groupId} */
  updateGroup(input: {
    number: string;
    groupId: string;
    name?: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    const { number, groupId, name, description } = input;
    return this.requestJson<Record<string, unknown>>(
      `/v1/groups/${encodeURIComponent(number)}/${encodeURIComponent(groupId)}`,
      {
        method: "PUT",
        body: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      },
    );
  }

  /** DELETE /v1/groups/{number}/{groupId} */
  deleteGroup(input: { number: string; groupId: string }): Promise<Record<string, unknown>> {
    return this.requestJson<Record<string, unknown>>(
      `/v1/groups/${encodeURIComponent(input.number)}/${encodeURIComponent(input.groupId)}`,
      { method: "DELETE" },
    );
  }

  /** PUT /v1/profiles/{number} */
  updateProfile(input: {
    number: string;
    name?: string;
    about?: string;
    base64Avatar?: string;
  }): Promise<Record<string, unknown>> {
    const { number, name, about, base64Avatar } = input;
    return this.requestJson<Record<string, unknown>>(
      `/v1/profiles/${encodeURIComponent(number)}`,
      {
        method: "PUT",
        body: {
          ...(name !== undefined ? { name } : {}),
          ...(about !== undefined ? { about } : {}),
          ...(base64Avatar !== undefined ? { base64_avatar: base64Avatar } : {}),
        },
      },
    );
  }

  /** POST /v1/register/{number} */
  registerNumber(input: {
    number: string;
    useVoice?: boolean;
    captcha?: string;
  }): Promise<Record<string, unknown>> {
    const { number, useVoice, captcha } = input;
    return this.requestJson<Record<string, unknown>>(
      `/v1/register/${encodeURIComponent(number)}`,
      {
        method: "POST",
        body: {
          ...(useVoice !== undefined ? { use_voice: useVoice } : {}),
          ...(captcha !== undefined ? { captcha } : {}),
        },
      },
    );
  }

  /** POST /v1/register/{number}/verify/{token} */
  verifyNumber(input: {
    number: string;
    token: string;
    pin?: string;
  }): Promise<Record<string, unknown>> {
    const { number, token, pin } = input;
    return this.requestJson<Record<string, unknown>>(
      `/v1/register/${encodeURIComponent(number)}/verify/${encodeURIComponent(token)}`,
      {
        method: "POST",
        body: pin !== undefined ? { pin } : {},
      },
    );
  }

  /** GET /v1/qrcodelink?device_name=... (returns the QR code PNG bytes) */
  async getQrCodeLink(input: { deviceName: string }): Promise<QrCodeLinkResult> {
    const query = new URLSearchParams({ device_name: input.deviceName }).toString();
    const bytes = await this.requestBytes(`/v1/qrcodelink?${query}`);
    return {
      deviceName: input.deviceName,
      base64Png: Buffer.from(bytes).toString("base64"),
    };
  }

  /** GET /v1/about */
  getAbout(): Promise<AboutInfo> {
    return this.requestJson<AboutInfo>("/v1/about");
  }

  /** GET /v1/health */
  getHealth(): Promise<HealthInfo> {
    return this.requestJson<HealthInfo>("/v1/health");
  }
}
