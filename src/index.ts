import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { startHttpServer } from "./http-transport.js";
import { createSignalMcpServer, SERVER_VERSION } from "./server.js";
import { SignalClient } from "./signal-client.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const HELP = `signal-api-mcp v${SERVER_VERSION}

A Model Context Protocol (MCP) server for Signal, backed by signal-cli-rest-api.

Usage:
  signal-api-mcp [--version] [--help]

Environment variables (see .env.example for details):
  SIGNAL_API_URL     Base URL of signal-cli-rest-api (default http://localhost:8080)
  SIGNAL_NUMBER      Default account number when a tool omits its \`number\` argument
  SIGNAL_TRANSPORT   stdio (default) | http
  HOST               HTTP bind host (default 127.0.0.1)
  PORT               HTTP bind port (default 3000)
  SIGNAL_MAX_BODY_BYTES  Max HTTP request body bytes (default 10485760)
  SIGNAL_SESSION_TTL_SECONDS  Seconds an idle HTTP session lasts (default 3600, min 60)
  SIGNAL_API_TOKEN   Optional bearer token required by the HTTP transport
  LOG_LEVEL          debug | info | warn | error (default info)
  SIGNAL_ALLOWED_RECIPIENTS  Opt-in recipient allowlist for send_message (comma-separated)
  SIGNAL_ALLOWED_HOSTS  Comma-separated Host header values the HTTP endpoint accepts
  SIGNAL_DISABLED_TOOLS  Comma-separated tool names to remove from the MCP surface
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--version")) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  if (args.includes("--help")) {
    process.stdout.write(HELP);
    return;
  }

  const config = loadConfig(process.env);
  const logger = createLogger(config.logLevel, { toStderr: config.transport === "stdio" });

  const client = new SignalClient({ baseUrl: config.signalApiUrl });

  if (config.transport === "http") {
    const httpServer = await startHttpServer(() => createSignalMcpServer(client, config), config, logger);
    logger.info("signal-api-mcp started", { transport: "http", url: httpServer.url });
  } else {
    const server = createSignalMcpServer(client, config);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("signal-api-mcp started", { transport: "stdio", signalApiUrl: config.signalApiUrl });
  }
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`signal-api-mcp failed to start: ${message}\n`);
  process.exit(1);
});
