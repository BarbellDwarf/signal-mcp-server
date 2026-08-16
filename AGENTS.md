# AGENTS.md

An agent that uses this MCP server's tools should read
[docs/agents/AGENTS.md](docs/agents/AGENTS.md) first. It covers the tool set, the default-number
behavior, and the rules around sending.

Repository conventions for working on the code:

- TypeScript source lives under `src/`, and tests live under `test/`.
- npm is the package manager, and `package-lock.json` is committed.
- `npm run build` produces the self-contained `dist/index.js` bundle.
- `npm test` runs the vitest suite, and `npm run lint` plus `npm run typecheck` enforce quality.
