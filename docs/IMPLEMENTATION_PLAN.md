# signal-mcp-server — Comprehensive Implementation Plan

Repo: **BarbellDwarf/signal-mcp-server**  ·  Follows the **issue-to-implementation** workflow.

## 1. Goal & Success Criteria

A Model Context Protocol (MCP) server that points at a running
[signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api) instance and lets an AI
agent use Signal properly (read, send, receive, manage groups/contacts).

**Must be true (acceptance criteria):**
- Connects to a configurable Signal REST API base URL + default account number.
- An agent can **send** text to one/many recipients and groups; **send** base64 attachments + link previews.
- An agent can **receive** incoming messages.
- An agent can **list** accounts, contacts, groups; **create/delete** groups; **update profile**.
- An agent can **register / verify / link** a number (QR code + raw device URI).
- Every capability is a well-described MCP tool over **stdio AND streamable HTTP**.
- **Self-contained & MetaMCP-hostable:** ships as a single-file bundle that runs with just `node dist/index.js` (all deps inlined — no node_modules at runtime); config via **environment variables only**, no config files.
- Installable as an npm package and as a Docker image.
- Tests prove every tool works against a mock Signal REST API (no real Signal account needed in CI).

## 2. Research summary (what exists & the gap)

Investigated the full Signal landscape + 7 existing Signal MCP servers (cloned & read source):

| Repo | Backend | Lang | #Tools | Transports | Points at Signal via |
|---|---|---|---|---|---|
| googlarz/signal-mcp | local signal-cli daemon JSON-RPC | Py | 72+ | stdio | localhost:7583 |
| daanrongen/signal-mcp | signal-cli daemon JSON-RPC | TS/Bun | 13 | stdio | SIGNAL_URL/api/v1/rpc |
| joestump/signal-mcp | signal-cli daemon JSON-RPC | Py | 7 | stdio+SSE | rpc:7583 |
| jiridudekusy/signal-cli-mcp | signal-cli-rest-api HTTP | TS | 3 | stdio | SIGNAL_CLI_BASE_URL (:8080) |
| Matthew-IDKA/signal-mcp | signal-cli-rest-api HTTP+WS | Py | 8 | stdio/Claude | SIGNAL_API_URL |
| Sealjay/mcp-signal | Desktop DB + signal-cli | Py | 9 | stdio+HTTP | data dir + bin |
| stefanstranger/signal-mcp-server | Signal Desktop DB (read-only) | Py | 3 | stdio | local DB |

**Gap (the reason to build fresh):** none of the 7 combines **REST-API-native** (pointed at a remote
signal-cli-rest-api HTTP URL) with **full bidirectional agent capability** + **streamable HTTP** +
**self-contained single-file** + **env-only config**. The best server (googlarz) is Python/stdio and
talks to a local daemon, not a remote REST URL. Building a fresh TypeScript server fills this exactly.

**Backend facts (signal-cli-rest-api):** plain HTTP JSON, NO auth/TLS (must be firewalled/proxied),
~70 endpoints under /v1 and /v2. Send = `POST /v2/send`; receive = `GET /v1/receive/{number}`
(poll in normal/native, WebSocket in json-rpc); recipients = `/v1/accounts`, `/v1/contacts/{number}`,
`/v1/groups/{number}`; register/verify/qrcodelink under `/v1`. Errors `{"error":...}`; 429 has
challenge_tokens; timestamps are unix seconds.

## 3. Design (confirmed with user)

- **Language/stack:** TypeScript/Node, official `@modelcontextprotocol/sdk`, zod for schemas.
- **Send model:** direct agent sending (no mandatory human approval).
- **Transport:** stdio + streamable HTTP (required for MetaMCP remote hosting).
- **Deployment:** npm package + Docker image; **single-file esbuild bundle** for self-containment.
- **Config:** env vars only — `SIGNAL_API_URL` (default `http://localhost:8080`), `SIGNAL_NUMBER`
  (default account), `SIGNAL_TRANSPORT`=`stdio|http`, `HOST`/`PORT` (HTTP), optional `SIGNAL_API_TOKEN`
  (optional bearer for the MCP HTTP endpoint), `LOG_LEVEL`.

## 4. Repo structure (signal-mcp-server)

```
.
├── src/
│   ├── index.ts            # entry: transport selection (stdio/http)
│   ├── config.ts           # env config + validation
│   ├── server.ts           # McpServer + tool registration
│   ├── signal-client.ts    # typed HTTP client for signal-cli-rest-api
│   ├── tools/              # one module per tool: schema + handler
│   └── types.ts
├── test/
│   ├── unit/               # config, signal-client, tool validation
│   ├── integration/        # tools against an in-process mock Signal REST API
│   └── e2e/                # real MCP Client over stdio + HTTP
├── scripts/build.mjs       # esbuild single-file bundle (self-contained)
├── Dockerfile
├── .github/workflows/ci.yml
├── README.md, LICENSE, package.json, tsconfig.json, .env.example
```

## 5. Tools to expose (initial comprehensive set)

| Tool | HTTP backend |
|---|---|
| send_message | POST /v2/send |
| send_message_with_attachments | POST /v2/send (base64_attachments, link_preview) |
| receive_messages | GET /v1/receive/{number} |
| list_accounts | GET /v1/accounts |
| list_contacts | GET /v1/contacts/{number} |
| list_groups / get_group | GET /v1/groups/{number}(/{id}) |
| create_group / update_group / delete_group | /v1/groups/* |
| update_profile | PUT /v1/profiles/{number} |
| register_number / verify_number | /v1/register/* |
| link_device_qrcode | GET /v1/qrcodelink |
| get_about / get_health | /v1/about, /v1/health |

## 6. Testing strategy

- **Unit:** config parsing/validation, signal-client request shaping, per-tool input validation (zod).
- **Integration:** an in-process mock Signal REST API (node http) implementing the needed endpoints;
  each tool handler is exercised against it, asserting correct request/response + error mapping
  (incl. `errors.recipients` partial-send and 429).
- **E2E:** start the real server over stdio AND streamable HTTP, connect with the official
  `@modelcontextprotocol/sdk` `Client`, `listTools()`, and call tools against the mock backend.
- **CI (GitHub Actions):** `npm ci && npm run lint && npm run typecheck && npm run build && npm test`.

## 7. Repo / workflow (issue-to-implementation, adapted for greenfield)

- Preflight done: gh authed (BarbellDwarf: repo/project/workflow), gh-stack installed, opencode +
  deepseek-flash verified (`opencode-go/deepseek-v4-flash` works headless).
- Create GitHub repo `signal-mcp-server` (public) with MIT license + README.
- Create a small set of GitHub issue tickets (scaffold, client, server+tools, transports, tests,
  docs) wired to the repo, per the skill; implement via **`opencode run -m opencode-go/deepseek-v4-flash`**
  (deepseek flash only — no pro models).
- One feature branch → one focused PR per ticket; CI must be green; scrub diff for personal info.
- **Merge only after explicit user confirmation.**

## 8. Out of scope (first cut)
- Auth/TLS on the Signal REST API itself (documented as backend responsibility).
- Real-time push inbound beyond poll/WS receive (documented behavior).
- Human-in-the-loop approval GUI.
- Persisting message history (signal-cli-rest-api does not expose history).

## 9. Milestones
1. Scaffold repo + tooling + CI.  2. config + signal-client.  3. MCP server + tools.
4. stdio + HTTP transports + entry + esbuild bundle.  5. tests (unit/integration/e2e).
6. README/LICENSE/.env.example/Dockerfile/publish.  7. Create GitHub repo, opencode-run implementation,
   push, CI green, PR(s), user-approved merge, close out.
