# Threat model

This document describes what protects what, and where the protections stop.

## Agent to MCP server

An AI agent connects to this server over either stdio or HTTP. The server sits between the agent
and Signal, and several controls shape what the agent can do.

**Bearer token.** When `SIGNAL_API_TOKEN` is set on the HTTP transport, every request needs a
valid `Authorization: Bearer` header. The server compares tokens using a timing-safe function. A
request without the header, or with the wrong value, gets a 401. The token does not apply to the
stdio transport, where the OS-level process boundary is the access control.

**Disabled tools.** `SIGNAL_DISABLED_TOOLS` removes tools from the MCP surface entirely. Disabled
tools never appear in `tools/list`, so the agent does not know they exist. This is the strongest
form of restriction: there is nothing to call, and no error to work around.

**Recipient allowlist.** `SIGNAL_ALLOWED_RECIPIENTS` limits who `send_message` can target. When
set, the server refuses any recipient not on the list and returns a structured error that names
the blocked recipients. It never reaches the backend for a blocked send.

**Session expiry.** `SIGNAL_SESSION_TTL_SECONDS` closes idle HTTP sessions after a configurable
window (default: one hour). A session that has expired answers 404, and the client must initialize
a new one. This limits how long a stale session id remains usable.

**Body cap.** `SIGNAL_MAX_BODY_BYTES` rejects POST requests larger than the configured limit
(default: 10 MiB) with a 413 before anything is parsed. Oversized payloads never reach the MCP
layer or the backend.

**DNS rebinding protection.** The HTTP transport checks the `Host` header against an allowlist.
When `SIGNAL_ALLOWED_HOSTS` is unset, the server derives the list from the bind address and port,
covering `localhost` and `127.0.0.1` forms. Any hostname not on the list gets a 403. Set
`SIGNAL_ALLOWED_HOSTS` explicitly when a reverse proxy or remote gateway forwards requests under
its own hostname.

## MCP server to signal-cli-rest-api

The backend, signal-cli-rest-api, has no built-in authentication and no TLS. The MCP server talks
to it over HTTP on the same machine, and inherits whatever trust that link carries.

Operators must keep the backend firewalled or behind a reverse proxy. Anyone who can reach port
8080 can read and send messages through it, with or without this MCP server in the picture. See
[.env.example](../.env.example) for the full warning.

The `SIGNAL_API_TOKEN` on the MCP server does nothing for the backend. They are separate surfaces
with separate protections.

## Agent to Signal network

Every `send_message` call from an agent is a real message from a real Signal account. It goes out
immediately. There is no approval step between the tool call and the network.

`SIGNAL_ALLOWED_RECIPIENTS` is the first guardrail: it narrows the set of recipients the agent
can reach. The operator reviewing what the agent sends is the second one. The
[docs/agents/AGENTS.md](agents/AGENTS.md) file tells the agent to confirm recipients and content
before sending, but an agent can ignore instructions. Treat it as untrusted.

## What this does not protect

- A compromised operator machine. If the host is owned, every control here is bypassed at the OS
  level.
- A backend exposed to the network. signal-cli-rest-api on a public port is an open relay, and
  this server cannot fix that.
- An operator who sets `HOST=0.0.0.0` without `SIGNAL_API_TOKEN`. The endpoint is reachable from
  any machine on the network with no authentication.
- Agents prompt-injected into calling allowed recipients harmfully. The allowlist stops the agent
  from sending outside the list, but it cannot judge whether a message to an allowed recipient is
  appropriate.
- The Signal protocol itself. This server does not alter Signal's end-to-end encryption or key
  management.

## Security behaviors under test

The file [test/integration/http-security.test.ts](../test/integration/http-security.test.ts)
exercises the HTTP transport's security behaviors: token enforcement, body size limits, host
header validation, and session expiry.

CI runs `npm audit --omit=dev --audit-level=high` as a gate on every pull request, so known
vulnerable dependencies block merges. Dependabot opens PRs for npm and GitHub Actions updates
automatically.
