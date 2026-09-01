import type { SignalClient } from "../signal-client.js";
import { SignalApiError } from "../types.js";

export interface ToolDeps {
  client: SignalClient;
  /** Default account number from SIGNAL_NUMBER, used when a tool omits `number`. */
  defaultNumber?: string;
  /** Opt-in allowlist of recipients send_message may target. Empty means unrestricted. */
  allowedRecipients?: Set<string>;
  /** Tool names the operator has disabled. These are never registered. */
  disabledTools?: Set<string>;
}

/** Resolve the effective sender number: explicit argument wins over the default. */
export function resolveNumber(
  requested: string | undefined,
  defaultNumber: string | undefined,
): string | undefined {
  return requested ?? defaultNumber;
}

/** Structured error result for a missing account number. */
export function missingNumberError(argumentName = "number") {
  return fail(
    new Error(
      `No Signal account number was provided. Pass "${argumentName}" or set the SIGNAL_NUMBER environment variable.`,
    ),
  );
}

/** Serialize a successful tool result as a text MCP content block. */
export function ok<T>(data: T): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }] };
}

/**
 * Serialize an error into a text MCP content block so the agent gets a clear,
 * machine-readable message instead of a bare protocol-level error.
 */
export function fail(error: unknown): { content: Array<{ type: "text"; text: string }> } {
  if (error instanceof SignalApiError) {
    return ok({
      error: {
        message: error.message,
        ...(error.status !== undefined ? { status: error.status } : {}),
        method: error.method,
        url: error.url,
        ...(error.challengeTokens !== undefined
          ? { challenge_tokens: error.challengeTokens }
          : {}),
      },
    });
  }
  if (error instanceof Error) {
    return ok({ error: { message: error.message } });
  }
  return ok({ error: { message: String(error) } });
}
