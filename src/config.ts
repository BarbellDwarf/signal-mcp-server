import { z } from "zod";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Transport = "stdio" | "http";

export interface SignalConfig {
  /** Base URL of the signal-cli-rest-api instance (no trailing slash). */
  signalApiUrl: string;
  /** Default account number used when a tool call omits `number`. */
  signalNumber?: string;
  /** MCP transport: stdio (default) or streamable HTTP. */
  transport: Transport;
  /** Bind host for the HTTP transport. */
  host: string;
  /** Bind port for the HTTP transport. */
  port: number;
  /** Optional bearer token required by the MCP HTTP endpoint. */
  apiToken?: string;
  logLevel: LogLevel;
  /**
   * Opt-in allowlist of recipients send_message may target. Empty means
   * sending is unrestricted. Present only when SIGNAL_ALLOWED_RECIPIENTS
   * is set to at least one entry.
   */
  allowedRecipients?: Set<string>;
}

const transportSchema = z.enum(["stdio", "http"]);
const logLevelSchema = z.enum(LOG_LEVELS);

const envSchema = z.object({
  SIGNAL_API_URL: z.string().url().default("http://localhost:8080"),
  SIGNAL_NUMBER: z.string().min(1).optional(),
  SIGNAL_TRANSPORT: transportSchema.default("stdio"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  SIGNAL_API_TOKEN: z.string().min(1).optional(),
  LOG_LEVEL: logLevelSchema.default("info"),
  SIGNAL_ALLOWED_RECIPIENTS: z.string().optional(),
});

/**
 * Split a comma-separated recipient allowlist into a Set. Each entry is
 * trimmed and blank entries are dropped, so " a, , b " becomes {a, b}.
 * Returns an empty Set when the variable is unset.
 */
function parseAllowedRecipients(raw: string | undefined): Set<string> {
  const allowed = new Set<string>();
  if (!raw) return allowed;
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed) allowed.add(trimmed);
  }
  return allowed;
}

/** Copy env treating empty strings as unset, so `SIGNAL_NUMBER=` means "no default". */
function stripEmptyStrings(env: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Read and validate configuration from environment variables only.
 * Throws a descriptive Error when any value is invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): SignalConfig {
  const parsed = envSchema.safeParse(stripEmptyStrings(env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "(root)";
        return `${field}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }

  const raw = parsed.data;
  // Normalize the base URL: strip any trailing slashes so path joins are clean.
  const signalApiUrl = raw.SIGNAL_API_URL.replace(/\/+$/, "");

  const allowedRecipients = parseAllowedRecipients(raw.SIGNAL_ALLOWED_RECIPIENTS);
  return {
    signalApiUrl,
    signalNumber: raw.SIGNAL_NUMBER,
    transport: raw.SIGNAL_TRANSPORT,
    host: raw.HOST,
    port: raw.PORT,
    apiToken: raw.SIGNAL_API_TOKEN,
    logLevel: raw.LOG_LEVEL,
    ...(allowedRecipients.size > 0 ? { allowedRecipients } : {}),
  };
}

/** Convenience: the config you get when no environment variables are set. */
export const DEFAULT_CONFIG: SignalConfig = loadConfig({});
