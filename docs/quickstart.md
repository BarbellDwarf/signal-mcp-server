# Quick start

This guide takes you from zero to a working setup. When you finish, an AI agent will be able to
send and receive Signal messages through the tools this server exposes.

You need Node 20 or newer, Docker, and a phone with the Signal app installed. Everything else on
this page is either a container or an npm package.

## Step 1: run signal-cli-rest-api

The server is only a bridge. It talks to a signal-cli-rest-api instance, and that instance does the
real work with the Signal network.

```bash
mkdir -p ~/.local/share/signal-api
docker run -d --name signal-api --restart=always -p 8080:8080 \
  -v ~/.local/share/signal-api:/home/.local/share/signal-cli \
  -e 'MODE=json-rpc' bbernhard/signal-cli-rest-api
```

The `-v` flag keeps the account data on your disk, so restarts do not wipe it. The `MODE=json-rpc`
setting keeps the container small. signal-cli-rest-api serves its HTTP API on port 8080.

Give the container a few seconds to boot, then check it:

```bash
curl http://localhost:8080/v1/health
```

You should get `{"status":"ok"}` back.

## Step 2: add a Signal number

The API needs a registered number before it can do anything. Pick one of the two paths below.

### Link a device to an existing number

Open this URL in a browser:

```
http://localhost:8080/v1/qrcodelink?device_name=signal-api-mcp
```

In the Signal app on your phone, go to Settings, then Linked devices, then Link new device, and
scan the QR code. The API is now linked as an extra device on your primary number.

### Register a new number

Registering asks Signal to send you a verification code. The number must be in international
format, with the country code and a plus sign.

```bash
curl -X POST http://localhost:8080/v1/register/+15551234567
```

Signal sends an SMS with a six-digit code. If SMS does not arrive, ask for a voice call instead:

```bash
curl -X POST http://localhost:8080/v1/register/+15551234567 \
  -H 'content-type: application/json' -d '{"use_voice": true}'
```

Finish with the code you received:

```bash
curl -X POST http://localhost:8080/v1/register/+15551234567/verify/123456
```

Some numbers trigger Signal's anti-spam captcha. When that happens the register request comes back
with a `challenge_tokens` object, and you need a captcha token to continue. The same flow is
available through the MCP tools `register_number` and `verify_number`, which accept a `captcha`
argument, so an agent can finish a registration without you touching curl. [docs/tools.md](docs/tools.md)
explains those tools in depth.

## Step 3: install the server

Install the npm package globally:

```bash
npm install -g signal-api-mcp
```

To run from the repository instead, clone it, run `npm install`, then `npm run build`. The build
creates `dist/index.js`, a single self-contained file. That path gives you no global command:
wherever the steps below say `signal-api-mcp`, run `npm start` or `node dist/index.js` from the
repository instead.

## Step 4: set the environment variables

The server configures itself through environment variables. Two matter for a basic setup:
`SIGNAL_API_URL`, the address of signal-cli-rest-api, and `SIGNAL_NUMBER`, the account the agent
acts as.

```bash
export SIGNAL_API_URL=http://localhost:8080
export SIGNAL_NUMBER=+15551234567
```

You can write these into a `.env` file for reference. The server does not read `.env` files itself,
so export them in your shell or hand them to the process. [docs/configuration.md](docs/configuration.md)
covers every variable.

## Step 5: run the server

The default transport is stdio, which MCP clients use when they spawn a process. Start it with the
environment variables set, and it will wait for a client to connect:

```bash
signal-api-mcp
```

For a quick smoke test, ask for version and help:

```bash
signal-api-mcp --version
signal-api-mcp --help
```

## Step 6: connect an MCP client

### opencode

Add this server to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "signal": {
      "type": "local",
      "command": ["signal-api-mcp"],
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

Add this server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "signal": {
      "command": "signal-api-mcp",
      "env": {
        "SIGNAL_API_URL": "http://localhost:8080",
        "SIGNAL_NUMBER": "+15551234567"
      }
    }
  }
}
```

Restart the client after saving the file. The tools become available as ordinary tools in the
conversation.

Not spawning a local process? [docs/transports.md](docs/transports.md) covers the HTTP transport,
remote hosting on MetaMCP, and the published Docker image.

## Send your first message

Ask the agent to send a message, naming a recipient that has your number saved:

> Send a message to +15559876543 that says "hello from the agent".

The agent calls `send_message` with `message` and `recipients`. Sending to a group works the same
way: use the group ID as a recipient. Run `list_groups` to find group IDs, and `list_contacts` to
confirm who is reachable before you send anything.

To read what came back while you were away, ask for messages. The agent calls `receive_messages`,
which polls the account and returns whatever is queued.

Sending is real and immediate. The message goes out the moment the tool runs, with no approval
gate. Double-check the recipient before you ask the agent to send, and keep an eye on what it sends
on your behalf.
