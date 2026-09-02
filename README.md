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
  -v ~/.local/share/signal-api:/home/.local/share/signal-cli \
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

The `-v` flag keeps the Signal account data on your disk across container restarts. Prefer Docker
for the server itself? The published image and its run instructions are in
[docs/transports.md](docs/transports.md#run-the-published-docker-image).

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
| `SIGNAL_MAX_BODY_BYTES` | `10485760` | Largest POST body the HTTP endpoint accepts, larger requests get a 413. |
| `SIGNAL_SESSION_TTL_SECONDS` | `3600` | Seconds an HTTP session may sit idle before the server closes it. |
| `SIGNAL_API_TOKEN` | empty | Optional bearer token for the HTTP endpoint. |
| `SIGNAL_ALLOWED_HOSTS` | empty | Comma-separated Host header allowlist for the HTTP endpoint. Empty derives one from the bind host and port. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `SIGNAL_ALLOWED_RECIPIENTS` | empty | Comma-separated allowlist of recipients `send_message` may target. |
| `SIGNAL_DISABLED_TOOLS` | empty | Comma-separated list of tool names to remove from the MCP surface. |

The table follows the same order as [docs/configuration.md](docs/configuration.md), which explains
each variable in its own section.

## The tools

The server exposes fifteen MCP tools. `send_message` and `receive_messages` handle messaging.
`list_accounts`, `list_contacts`, and `list_groups` show you what the account can reach. The
remaining tools cover groups, profiles, registration, linking, and the health endpoints. Every tool
maps to one signal-cli-rest-api endpoint, and [docs/tools.md](docs/tools.md) documents them all.

## Security

The HTTP transport binds to `127.0.0.1` by default. An optional bearer token guards the endpoint,
DNS rebinding protection filters the `Host` header, oversized requests get cut off, and idle
sessions expire. A recipient allowlist can constrain `send_message`. CI runs an audit gate on every
pull request. [SECURITY.md](SECURITY.md) has the vulnerability reporting policy, and
[docs/security.md](docs/security.md) covers the threat model.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| 401 `Unauthorized: missing or invalid bearer token` | `SIGNAL_API_TOKEN` is set and the request carries no header or the wrong value. | Send `Authorization: Bearer <token>`, or clear the variable. |
| 403 `Invalid Host header: ...` | DNS rebinding protection: the `Host` header is not on the allowlist. | Add the exact `host:port` form to `SIGNAL_ALLOWED_HOSTS`. |
| 413 `Payload too large` | The POST body exceeded `SIGNAL_MAX_BODY_BYTES`. | Shrink the request or raise the cap. |
| 404 `Session not found` | The HTTP session idled past `SIGNAL_SESSION_TTL_SECONDS`. | Initialize a fresh session. |
| Error naming blocked recipients | `SIGNAL_ALLOWED_RECIPIENTS` is set and a recipient is outside it. | Add the recipient to the list, or send to someone on it. |
| `No Signal account number was provided` | No `number` argument and no `SIGNAL_NUMBER` default. | Pass `number` or set the variable. |
| An HTTP error from the backend | signal-cli-rest-api refused the call. | The error body carries the backend's reason; check the backend container's logs. |

## Guides

- [Quick start](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Tools](docs/tools.md)
- [Transports and remote hosting](docs/transports.md)
- [Security](docs/security.md)
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
