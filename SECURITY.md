# Security policy

signal-api-mcp is a Model Context Protocol server that bridges AI agents to Signal through
signal-cli-rest-api.

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | Yes |
| < 0.2.0 | No |

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/BarbellDwarf/signal-mcp-server/security/advisories/new)
to report a security issue. Do not open a public issue for security problems.

### What to include

- The affected version or commit.
- Whether you tested against the stdio or HTTP transport.
- The relevant configuration, with secrets redacted.
- Steps to reproduce the issue.

### What to expect

We will acknowledge your report within a few days. A fix or mitigation path will follow as soon
as we have one. We do not commit to a specific timeline.

## Scope

In scope:

- This server's HTTP transport.
- This server's stdio transport.
- The MCP tool surface.
- Configuration parsing.
- Packaging: the Docker image and the npm package.

Out of scope:

- signal-cli-rest-api internals (report those upstream).
- The Signal protocol itself.
- The operator's host security.
- MCP client vulnerabilities.

## Safe harbor

Good-faith security research against a self-hosted instance you own, or one you have written
permission to test, is welcome. We will not pursue legal action against researchers who follow
this policy.
