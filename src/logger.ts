import type { LogLevel } from "./config.js";

type LevelRank = Record<LogLevel, number>;
const RANK: LevelRank = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const metaPart = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;
  return `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${metaPart}`;
}

/**
 * Tiny zero-dependency logger. `error` always goes to stderr; other levels go
 * to stdout unless `options.toStderr` is set (required for the stdio MCP
 * transport, where stdout must carry only JSON-RPC traffic).
 */
export function createLogger(level: LogLevel, options: { toStderr?: boolean } = {}): Logger {
  const enabled = (candidate: LogLevel): boolean => RANK[candidate] >= RANK[level];
  const write = (candidate: LogLevel, message: string, meta?: unknown): void => {
    if (!enabled(candidate)) return;
    const line = format(candidate, message, meta);
    if (candidate === "error" || options.toStderr === true) {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
  };
}
