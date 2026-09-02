# Transports and remote hosting

The server runs on one of two MCP transports, chosen with `SIGNAL_TRANSPORT`. `stdio` is the
default and covers the common case of a client spawning the server locally. `http` starts a
streamable HTTP server, which is what you need to host the server on a remote gateway.

## stdio

A stdio MCP client starts the server as a child process, and the two sides talk over standard
input and output. opencode and Claude Desktop work this way. The server writes its logs to stderr
so stdout carries nothing but the JSON-RPC protocol.

Start it exactly as you would start any command, with the environment variables set:

```bash
export SIGNAL_API_URL=http://localhost:8080
export SIGNAL_NUMBER=+15551234567
signal-api-mcp
```

The process runs until the client closes it. `--version` and `--help` work here too, though an MCP
client usually ignores them.

## Streamable HTTP

Set `SIGNAL_TRANSPORT=http` and the server becomes an HTTP server:

```bash
export SIGNAL_TRANSPORT=http
export HOST=0.0.0.0
export PORT=3000
# <host> is the hostname clients use to reach this server
export SIGNAL_ALLOWED_HOSTS=<host>:3000
signal-api-mcp
```

`SIGNAL_ALLOWED_HOSTS` matters on a remote bind: requests from other machines arrive with a Host
header the server cannot guess, and without the override they get a 403.

The MCP endpoint lives at `/mcp`. The server speaks the streamable HTTP flavor of the protocol:

- `POST` sends JSON-RPC requests. A successful `initialize` request opens a session and returns an
  `mcp-session-id` header.
- `GET` opens or reopens an SSE stream for an existing session, so the client can receive
  notifications.
- `DELETE` terminates a session.

Each client session gets its own server instance, so sessions stay isolated from one another. The
server treats `/mcp` and `/` as the same endpoint, and anything else returns a 404.

When `SIGNAL_API_TOKEN` is set, every request must carry `Authorization: Bearer <token>`.
Requests without the header, or with the wrong token, get a 401.

## Run the published Docker image

Every release publishes an image to GHCR, tagged with the release name and `latest`:

```bash
docker pull ghcr.io/barbelldwarf/signal-mcp-server:v0.2.0
```

For remote hosting, run it in HTTP mode with the container binding on all interfaces, so the port
mapping can reach the server:

```bash
docker run -d --name signal-mcp -p 3000:3000 \
  -e SIGNAL_API_URL=http://host.docker.internal:8080 \
  -e SIGNAL_NUMBER=+15551234567 \
  -e SIGNAL_TRANSPORT=http \
  -e HOST=0.0.0.0 \
  -e SIGNAL_ALLOWED_HOSTS=<host>:3000 \
  -e SIGNAL_API_TOKEN=replace-with-a-long-random-string \
  ghcr.io/barbelldwarf/signal-mcp-server:v0.2.0
```

`HOST=0.0.0.0` matters here: the server binds `127.0.0.1` by default, and a loopback bind inside
the container is unreachable through a published port. The image runs as the unprivileged `node`
user. For local clients that spawn a process, use the npm package instead; the image exists for
hosting.

## Hosting on MetaMCP

MetaMCP connects to a remote streamable HTTP MCP endpoint, so the server's single-file bundle and
HTTP transport fit it well. Run the server on a machine MetaMCP can reach, with the token set:

```bash
export SIGNAL_TRANSPORT=http
export HOST=0.0.0.0
export PORT=3000
export SIGNAL_API_TOKEN=replace-with-a-long-random-string
export SIGNAL_ALLOWED_HOSTS=<host>:3000
signal-api-mcp
```

Then give MetaMCP the endpoint `http://<host>:3000/mcp` and the bearer token. `SIGNAL_ALLOWED_HOSTS`
must name the host MetaMCP uses to reach the server, because remote requests carry that Host header
and the server rejects any Host it does not expect with a 403. The same recipe works
for any streamable HTTP MCP client. The Docker image packages this server for containerized
hosting, so you can run it wherever you run containers.

## Security notes

signal-cli-rest-api has no built-in authentication and no TLS. Anyone who can reach port 8080 can
read and send messages through it. Keep it on a private network, or put it behind a reverse proxy
that adds TLS and authentication. Never expose it to the public internet.

The MCP server's own HTTP endpoint is a separate surface. Protect it with `SIGNAL_API_TOKEN`, and
bind it to a private interface unless you need outside access. Signal encrypts message content
end to end, which covers the payload, and the connections between this server and
signal-cli-rest-api still deserve the usual network hygiene.
