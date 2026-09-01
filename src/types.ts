/** Shared types for the signal-cli-rest-api HTTP surface. */

export interface LinkPreview {
  url: string;
  title?: string;
  image?: string;
}

export interface SendMessageInput {
  /** Sender account number (international format). */
  number: string;
  /** Message body text. */
  message: string;
  /** Recipient phone numbers and/or group IDs. */
  recipients: string[];
  /** Optional base64-encoded file attachments. */
  base64Attachments?: string[];
  /** Optional link preview to attach. */
  linkPreview?: LinkPreview;
  /** Optional text mode: normal | styled. */
  textMode?: "normal" | "styled";
}

export interface SendMessageResult {
  /** Unix timestamp (seconds) of the sent message. */
  timestamp?: number;
  /**
   * Present on partial sends: maps a recipient to the list of errors that
   * prevented delivery to that recipient.
   */
  errors?: Record<string, string[]>;
}

export interface GroupInfoRef {
  groupId?: string;
  groupName?: string;
  [key: string]: unknown;
}

export interface DataMessage {
  timestamp?: number;
  message?: string;
  groupInfo?: GroupInfoRef | null;
  attachments?: Array<Record<string, unknown>> | null;
  quote?: Record<string, unknown> | null;
  reactions?: Array<Record<string, unknown>> | null;
  mentions?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
}

export interface SignalEnvelope {
  timestamp?: number;
  source?: string;
  sourceUuid?: string;
  sourceName?: string;
  dataMessage?: DataMessage | null;
  syncMessage?: Record<string, unknown> | null;
  receiptMessage?: Record<string, unknown> | null;
  typingMessage?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ReceivedMessage {
  account?: string;
  envelope: SignalEnvelope;
  [key: string]: unknown;
}

export interface Contact {
  number?: string;
  name?: string;
  color?: string;
  [key: string]: unknown;
}

export interface Group {
  id?: string;
  groupId?: string;
  name?: string;
  description?: string;
  members?: Array<string | Record<string, unknown>>;
  [key: string]: unknown;
}

export interface CreateGroupInput {
  name: string;
  members: string[];
  description?: string;
}

export interface CreateGroupResult {
  id: string;
  [key: string]: unknown;
}

export interface UpdateProfileInput {
  name?: string;
  about?: string;
  base64Avatar?: string;
}

export interface QrCodeLinkResult {
  deviceName: string;
  /** The QR code image (PNG) as a base64-encoded string. */
  base64Png: string;
}

export interface AboutInfo {
  version?: string;
  latestVersion?: string;
  [key: string]: unknown;
}

export interface HealthInfo {
  status?: string;
  [key: string]: unknown;
}

export interface SignalApiErrorBody {
  error?: string;
  challenge_tokens?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Typed error thrown by the Signal API client.
 * Carries HTTP status, method, URL and (when available) the parsed response body,
 * including any `challenge_tokens` returned with an HTTP 429.
 */
export class SignalApiError extends Error {
  readonly status?: number;
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly challengeTokens?: Record<string, unknown>;

  constructor(
    message: string,
    options: { status?: number; method?: string; url?: string; body?: unknown } = {},
  ) {
    super(message);
    this.name = "SignalApiError";
    this.status = options.status;
    this.method = options.method ?? "GET";
    this.url = options.url ?? "";
    this.body = options.body;
    if (options.body && typeof options.body === "object") {
      const body = options.body as SignalApiErrorBody;
      if (body.challenge_tokens) {
        this.challengeTokens = body.challenge_tokens;
      }
    }
  }
}
