# signal-api-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for Signal. It talks to a
[signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance and gives an AI
agent a working Signal toolset: send and receive messages, manage groups and contacts, update your
profile, and register or link a number.

The build produces one self-contained JavaScript file. The server needs nothing but a Node runtime
and a few environment variables, so it runs on a laptop just as well as on a remote MCP gateway like
[MetaMCP](https://metamcp.io).

## Quick start

Run signal-cli-rest-api in Docker, link or register a Signal number, then install and start the
server. The full walkthrough is in [docs/quickstart.md](docs/quickstart.md).

```bash
# 1. signal-cli-rest-api
docker run -d --name signal-api --restart=always -p 8080:8080 \
  -e 'MODE=json-rpc' bbernhard/signal-cli-rest-api

# 2. install the server
npm install -g signal-api-mcp

# ⚠ The npm package named "signal-mcp-server" is an unrelated project.
# Do not install it by mistake.

# 3. run it
SIGNAL_API_URL=http://localhost:8080 \
SIGNAL_NUMBER=+15551234567 \
signal-api-mcp
```

## Configuration

The server reads its configuration from environment variables. `SIGNAL_API_URL` points at your
signal-cli-rest-api instance, `SIGNAL_NUMBER` sets the default account, and `SIGNAL_TRANSPORT`
picks between stdio and streamable HTTP. [docs/configuration.md](docs/configuration.md) covers
every variable in detail.

| Variable | Default | What it does |
|---|---|---|
| `SIGNAL_API_URL` | `http://localhost:8080` | Base URL of signal-cli-rest-api. |
| `SIGNAL_NUMBER` | empty | Default account used when a tool omits `number`. |
| `SIGNAL_TRANSPORT` | `stdio` | `stdio` or `http`. |
| `HOST` | `127.0.0.1` | Bind host for the HTTP transport. |
| `PORT` | `3000` | Bind port for the HTTP transport. |
| `SIGNAL_API_TOKEN` | empty | Optional bearer token for the HTTP endpoint. |
| `SIGNAL_MAX_BODY_BYTES` | `10485760` | Largest POST body the HTTP endpoint accepts, larger requests get a 413. |
| `SIGNAL_ALLOWED_HOSTS` | empty | Comma-separated Host header allowlist for the HTTP endpoint. Empty derives one from the bind host and port. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `SIGNAL_ALLOWED_RECIPIENTS` | empty | Comma-separated allowlist of recipients `send_message` may target. |

## The tools

The server exposes fifteen MCP tools. `send_message` and `receive_messages` handle messaging.
`list_accounts`, `list_contacts`, and `list_groups` show you what the account can reach. The
remaining tools cover groups, profiles, registration, linking, and the health endpoints. Every tool
maps to one signal-cli-rest-api endpoint, and [docs/tools.md](docs/tools.md) documents them all.

## Guides

- [Quick start](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Tools](docs/tools.md)
- [Transports and remote hosting](docs/transports.md)
- [Development](docs/development.md)

## For AI agents

If you are an agent that will call these tools, read
[docs/agents/AGENTS.md](docs/agents/AGENTS.md) first. It explains the tool set, the default-number
behavior, and the rules around sending.

## Disclaimer

This project comes with no warranty. It is provided as-is, and the authors accept no responsibility
for anything that happens when you use it. Signal messages are real and immediate, and an AI agent
can make mistakes. Treat the agent's output as untrusted, guardrail it, and review what it sends
before it goes out. You are responsible for how you use this software.

## License

MIT
