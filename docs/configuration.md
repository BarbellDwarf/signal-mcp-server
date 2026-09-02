# Configuration

The server reads everything from environment variables. There are no config files and no
command-line arguments beyond `--help` and `--version`. When a variable is invalid, the server
refuses to start and prints the reason to stderr.

Empty strings are treated as unset. Setting `SIGNAL_NUMBER=` therefore means "no default number",
same as leaving the variable out entirely. This also means you cannot set a variable to a blank
value on purpose.

## Variables at a glance

| Variable | Default | Valid values |
|---|---|---|
| `SIGNAL_API_URL` | `http://localhost:8080` | Any URL |
| `SIGNAL_NUMBER` | unset | Any non-empty string |
| `SIGNAL_TRANSPORT` | `stdio` | `stdio`, `http` |
| `HOST` | `127.0.0.1` | Any non-empty string |
| `PORT` | `3000` | Integer from 0 to 65535 |
| `SIGNAL_MAX_BODY_BYTES` | `10485760` | Positive integer (bytes) |
| `SIGNAL_SESSION_TTL_SECONDS` | `3600` | Integer, minimum 60 (seconds) |
| `SIGNAL_API_TOKEN` | unset | Any non-empty string |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `SIGNAL_ALLOWED_RECIPIENTS` | unset | Any comma-separated string |
| `SIGNAL_ALLOWED_HOSTS` | unset | Any comma-separated string |
| `SIGNAL_DISABLED_TOOLS` | unset | Any comma-separated string |

## SIGNAL_API_URL

Base URL of the signal-cli-rest-api instance the server talks to. It must be a valid URL, and any
trailing slashes are stripped so path joins stay clean.

```bash
export SIGNAL_API_URL=http://localhost:8080
export SIGNAL_API_URL=https://signal.example.internal:8443
```

## SIGNAL_NUMBER

Default account number, in international format. When a tool that needs an account gets no explicit
`number` argument, the server uses this value.

```bash
export SIGNAL_NUMBER=+15551234567
```

### How the default number works

Nine tools accept an optional `number` argument: `send_message`, `receive_messages`,
`list_contacts`, `list_groups`, `get_group`, `create_group`, `update_group`, `delete_group`, and
`update_profile`. For each of them, the explicit argument wins, and `SIGNAL_NUMBER` is the fallback.

When neither an argument nor the variable is available, the tool returns a structured error that
tells you to pass `number` or set `SIGNAL_NUMBER`. The tools `list_accounts`, `register_number`,
`verify_number`, `link_device_qrcode`, `get_about`, and `get_health` never use a default number,
because an account is either returned by the backend or passed as a required argument.

Setting a default is convenient, and it carries risk. An agent that never passes `number` acts as
this account, so it can send messages as that person without saying who it is. Leave `SIGNAL_NUMBER`
unset if you want every account-dependent tool call to state the number explicitly.

## SIGNAL_TRANSPORT

Which MCP transport the server runs on.

- `stdio` is the default. The client spawns the server as a process and they talk over standard
  input and output. opencode and Claude Desktop use this. Logs go to stderr so stdout stays clean
  for the protocol.
- `http` starts a streamable HTTP server. Remote MCP gateways such as MetaMCP use this. See
  [docs/transports.md](docs/transports.md) for the full picture.

```bash
export SIGNAL_TRANSPORT=stdio
export SIGNAL_TRANSPORT=http
```

## HOST and PORT

These only matter when `SIGNAL_TRANSPORT=http`. `HOST` is the interface to bind on, and `PORT` is
the TCP port.

```bash
export HOST=127.0.0.1
export PORT=3000
```

`HOST` defaults to `127.0.0.1`, so the endpoint listens on loopback and nothing outside the machine
can reach it. Set `HOST=0.0.0.0` when the server runs in a container or on a remote host and other
machines should connect. Pair a remote bind with `SIGNAL_ALLOWED_HOSTS` (below), because remote
clients arrive under a hostname the derived list does not cover.

## SIGNAL_MAX_BODY_BYTES

Maximum request body size for the HTTP transport, in bytes. POST requests with a larger body get a
413 before the server parses anything, so an oversized payload never reaches the MCP layer
or the Signal backend.

```bash
export SIGNAL_MAX_BODY_BYTES=10485760
```

The default is 10485760, i.e. 10 MiB, and the built-in tools need far less than that. Raise it for
clients that batch unusually large tool arguments. A smaller value works as a guard against
oversized requests.

## SIGNAL_SESSION_TTL_SECONDS

How long an HTTP session may sit idle before the server closes it, in seconds. Idle means no
request carrying that session's id reached the session in the window, so every request that
reaches the session counts, whether it succeeded or failed. Requests rejected earlier (wrong
token, oversized body, unknown path) do not reset the idle clock. The default is 3600, one hour,
and the minimum is 60. A smaller value makes the server refuse to start.

```bash
export SIGNAL_SESSION_TTL_SECONDS=3600
```

A request that is still being handled is never cut off mid-flight. The sweep skips sessions with
a request in progress, so an SSE stream held open for hours keeps its session alive until the
stream ends. The sweep itself runs at most once a minute, so an idle session lingers a little
longer than the TTL before it disappears.

Once a session has expired, requests carrying its id get a 404 "Session not found", the same
answer any unknown session id gets. A client is expected to respond by initializing a fresh
session. The sweep timer is unref'd and cleared when the server shuts down, so it never keeps
the process alive on its own.

## SIGNAL_API_TOKEN

Optional bearer token for the HTTP transport. When set, every request to the MCP endpoint must
carry `Authorization: Bearer <token>`, and anything else gets a 401. The token also protects the
session management endpoints.

```bash
export SIGNAL_API_TOKEN=replace-with-a-long-random-string
```

Generate one with `openssl rand -hex 32` or the equivalent on your system. The token only guards
the MCP server's own HTTP endpoint. It does nothing for signal-cli-rest-api, which has no
authentication of its own.

## SIGNAL_ALLOWED_HOSTS

Host header values the HTTP endpoint accepts, as a comma-separated list. The transport compares the
raw `Host` header exactly, port included, so list every form clients can send:

```bash
export SIGNAL_ALLOWED_HOSTS=mcp.example.com,mcp.example.com:443
```

When the variable is unset, the server derives the list after it starts listening: the bind host
with and without the port, plus `localhost` and `127.0.0.1` forms. That covers loopback access,
including the ephemeral port you get from `PORT=0`. IPv6 literals arrive bracketed in the Host
header, so a bind on an IPv6 address also allows the bracketed forms, and a `::` bind allows `::1`
clients.

Override the derived list when requests arrive under a hostname the server cannot guess. That is
the case when a reverse proxy terminates TLS in front of the server, or when a remote gateway such
as MetaMCP forwards requests under its own domain. List the exact host and, where it applies, the
`host:port` form. Anything else gets a 403 from the transport, which is the DNS rebinding
protection doing its job.

## LOG_LEVEL

How chatty the server is: `debug`, `info`, `warn`, or `error`. `info` is the default and covers
startup and notable events. `debug` adds request detail, which helps when a tool call behaves
unexpectedly. `error` keeps the output nearly silent.

```bash
export LOG_LEVEL=debug
```

## SIGNAL_ALLOWED_RECIPIENTS

Opt-in recipient allowlist for `send_message`. Set it to a comma-separated list of phone numbers
and group IDs. When it is set, `send_message` refuses to send to any recipient that is not on the
list and returns a structured error that names the blocked recipients. It never calls the backend
for a blocked send.

```bash
export SIGNAL_ALLOWED_RECIPIENTS=+15551234567,+15559876543
```

Whitespace around entries is ignored, and empty entries are dropped, so
`+15551234567, , group-1` means the same as `+15551234567,group-1`. Leave the variable unset or
empty to allow sending to anyone. That is the default, so the server behaves exactly as before
until you set the allowlist.

The allowlist guards `send_message` only. It does not restrict who can message you, and it does not
affect any other tool. Use it when an agent might send somewhere it should not, and keep the list to
the recipients that agent is allowed to reach.

## SIGNAL_DISABLED_TOOLS

Comma-separated list of tool names to remove from the MCP surface. Disabled tools are never
registered, so they do not appear in `tools/list` and an agent cannot call them. This is the
strongest form of restriction: the agent does not even know the tool exists.

```bash
export SIGNAL_DISABLED_TOOLS=register_number,verify_number,link_device_qrcode
```

Names must match the tool names in [docs/tools.md](docs/tools.md) exactly. Whitespace around
entries is ignored and blank entries are dropped. Unknown names produce a warning the first time
they are seen, but
do not prevent the server from running, so you can safely deploy a new version before updating
the list.

When the variable is unset or empty, every tool is registered and available.
