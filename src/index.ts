import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { startHttpServer } from "./http-transport.js";
import { createSignalMcpServer, SERVER_VERSION } from "./server.js";
import { SignalClient } from "./signal-client.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const HELP = `signal-mcp-server v${SERVER_VERSION}

A Model Context Protocol (MCP) server for Signal, backed by signal-cli-rest-api.

Usage:
  signal-mcp-server [--version] [--help]

Environment variables (see .env.example for details):
  SIGNAL_API_URL     Base URL of signal-cli-rest-api (default http://localhost:8080)
  SIGNAL_NUMBER      Default account number when a tool omits its \`number\` argument
  SIGNAL_TRANSPORT   stdio (default) | http
  HOST               HTTP bind host (default 0.0.0.0)
  PORT               HTTP bind port (default 3000)
  SIGNAL_API_TOKEN   Optional bearer token required by the HTTP transport
  LOG_LEVEL          debug | info | warn | error (default info)
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
    logger.info("signal-mcp-server started", { transport: "http", url: httpServer.url });
  } else {
    const server = createSignalMcpServer(client, config);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("signal-mcp-server started", { transport: "stdio", signalApiUrl: config.signalApiUrl });
  }
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`signal-mcp-server failed to start: ${message}\n`);
  process.exit(1);
});
