# signal-mcp-server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that points at a
[signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance and lets an AI
agent use Signal properly — send messages (text, attachments, link previews), receive messages,
manage groups and contacts, update your profile, and register/link a number.

It is **self-contained**: the build produces a single `dist/index.js` that runs with just
`node dist/index.js` (no `node_modules` at runtime), and it is configured entirely through
environment variables. That makes it easy to host on a remote MCP gateway such as
[MetaMCP](https://metamcp.io) or to run locally for opencode / Claude.

## Features

- **Send** text messages to one or many recipients and to groups.
- **Send** messages with base64-encoded attachments and link previews.
- **Receive** incoming messages (polling).
- **List** accounts, contacts, and groups; **get** a single group.
- **Create / update / delete** groups.
- **Update** your profile (name, about, avatar).
- **Register / verify** a number and get a **device-link QR code**.
- **stdio** and **streamable HTTP** transports.
- Optional bearer-token auth on the HTTP endpoint.

## Tools

| Tool | Description |
|---|---|
| `send_message` | Send a text message to one or more recipients (or a group). |
| `receive_messages` | Poll and receive messages for an account. |
| `list_accounts` | List registered/linked account numbers. |
| `list_contacts` | List known contacts for an account. |
| `list_groups` | List groups for an account. |
| `get_group` | Get a single group by id. |
| `create_group` | Create a new group. |
| `update_group` | Update a group's name/description. |
| `delete_group` | Delete a group. |
| `update_profile` | Update profile name/about/avatar. |
| `register_number` | Register a number (SMS/voice/captcha). |
| `verify_number` | Verify a number with the received code. |
| `link_device_qrcode` | Get a QR code to link a device. |
| `get_about` | Get backend version/capabilities. |
| `get_health` | Health check. |

## Architecture

```
AI agent (opencode / Claude / MetaMCP)
        │  MCP (stdio or streamable HTTP)
        ▼
signal-mcp-server  (this repo, single-file bundle)
        │  HTTP JSON
        ▼
signal-cli-rest-api  (Docker container, port 8080)
        │
        ▼
Signal network
```

## Quickstart

### 1. Run signal-cli-rest-api

```bash
mkdir -p ~/.local/share/signal-api
docker run -d --name signal-api --restart=always -p 8080:8080 \
  -v ~/.local/share/signal-api:/home/.local/share/signal-cli \
  -e 'MODE=json-rpc' bbernhard/signal-cli-rest-api
```

### 2. Link a Signal account

Open `http://localhost:8080/v1/qrcodelink?device_name=signal-mcp-server` in a browser, then in the
Signal app go to **Settings → Linked devices** and scan the QR code.

### 3. Install and run signal-mcp-server

```bash
npm install -g signal-mcp-server   # or: npm install && npm run build
SIGNAL_API_URL=http://localhost:8080 \
SIGNAL_NUMBER=+15551234567 \
signal-mcp-server
```

## Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `SIGNAL_API_URL` | `http://localhost:8080` | Base URL of signal-cli-rest-api. |
| `SIGNAL_NUMBER` | *(empty)* | Default account number used when a tool omits `number`. |
| `SIGNAL_TRANSPORT` | `stdio` | `stdio` or `http` (streamable HTTP). |
| `HOST` | `0.0.0.0` | HTTP bind host (when `SIGNAL_TRANSPORT=http`). |
| `PORT` | `3000` | HTTP bind port (when `SIGNAL_TRANSPORT=http`). |
| `SIGNAL_API_TOKEN` | *(empty)* | Optional bearer token required by the HTTP endpoint. |
| `LOG_LEVEL` | `info` | `debug` | `info` | `warn` | `error`. |

## MCP client configuration

### opencode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "signal": {
      "type": "local",
      "command": ["signal-mcp-server"],
      "environment": {
        "SIGNAL_API_URL": "http://localhost:8080",
        "SIGNAL_NUMBER": "+15551234567"
      },
      "enabled": true
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "signal": {
      "command": "signal-mcp-server",
      "env": {
        "SIGNAL_API_URL": "http://localhost:8080",
        "SIGNAL_NUMBER": "+15551234567"
      }
    }
  }
}
```

## Hosting on MetaMCP (remote)

Because the server is a single self-contained file and supports **streamable HTTP**, you can host it
remotely. Run it with the HTTP transport:

```bash
SIGNAL_TRANSPORT=http HOST=0.0.0.0 PORT=3000 SIGNAL_API_TOKEN=your-token node dist/index.js
```

Then point MetaMCP (or any streamable-HTTP MCP client) at `http://<host>:3000/mcp` with the bearer
token. The Docker image (`Dockerfile`) packages the same bundle for containerized hosting.

> **Security:** signal-cli-rest-api has **no built-in auth or TLS**. Keep it firewalled or behind a
> reverse proxy that adds TLS/auth, and never expose it publicly. Use `SIGNAL_API_TOKEN` to protect
> the MCP HTTP endpoint.

## Development

```bash
npm install
npm run build      # esbuild single-file bundle -> dist/index.js
npm test           # vitest (unit + integration + e2e)
npm run typecheck
npm run lint
```

Tests run against an in-process mock of signal-cli-rest-api, so no real Signal account is needed.

## License

MIT
