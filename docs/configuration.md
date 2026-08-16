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
| `HOST` | `0.0.0.0` | Any non-empty string |
| `PORT` | `3000` | Integer from 0 to 65535 |
| `SIGNAL_API_TOKEN` | unset | Any non-empty string |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

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
export HOST=0.0.0.0
export PORT=3000
```

`0.0.0.0` binds on every interface, which is what you want for a container or a remote host.
Use `127.0.0.1` to keep the endpoint local only.

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

## LOG_LEVEL

How chatty the server is: `debug`, `info`, `warn`, or `error`. `info` is the default and covers
startup and notable events. `debug` adds request detail, which helps when a tool call behaves
unexpectedly. `error` keeps the output nearly silent.

```bash
export LOG_LEVEL=debug
```
