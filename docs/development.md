# Development

This page covers building the project, running its checks, and shipping it. The source is
TypeScript, the runtime is Node 20 or newer, and the build is a single esbuild step.

## Install

```bash
npm install
```

## npm scripts

| Script | What it does |
|---|---|
| `npm run build` | Bundles the source into `dist/index.js`. |
| `npm start` | Runs the built bundle with `node dist/index.js`. |
| `npm test` | Runs the test suite with vitest. |
| `npm run test:watch` | Runs vitest in watch mode. |
| `npm run lint` | Lints the code with ESLint, zero warnings allowed. |
| `npm run typecheck` | Type-checks the source and the tests. |
| `npm run clean` | Deletes `dist`. |

## The build

`npm run build` runs `scripts/build.mjs`, which drives esbuild. The result is `dist/index.js`, a
single file with every dependency inlined. The bundle is ESM, targets Node 20, and carries a
shebang line so it runs directly. esbuild emits a source map next to it for local debugging; the
npm tarball ships only `dist/index.js`, so published installs carry no map. `package.json` points
`main` and `bin` at this file, which is why the package needs no `node_modules` at runtime.

The self-contained bundle is the point. You can copy `dist/index.js` to a machine, run it with
`node dist/index.js`, and get a working MCP server as long as the environment variables are set.

## Tests

`npm test` runs vitest against three suites:

- `test/unit` covers config parsing and the HTTP client in isolation.
- `test/integration` exercises every tool against an in-process mock of signal-cli-rest-api.
- `test/e2e` spawns the real built bundle over stdio and HTTP and drives it with the official MCP
  client.

The vitest global setup builds the bundle before the suites run, because the e2e tests execute the
actual `dist/index.js`. Everything runs against the in-process mock, so no real Signal account is
needed and the tests work offline.

## Docker image

The `Dockerfile` uses two stages. The build stage installs dependencies and runs the esbuild
bundle. The runtime stage copies only `dist` onto a `node:20-alpine` base and runs as the
unprivileged `node` user, so the image holds the bundle and the Node runtime, nothing else. Port
3000 is exported for the HTTP transport.

The default command runs `node dist/index.js`, which means the default transport is stdio. To use
the HTTP transport in a container, pass the environment variables. `HOST=0.0.0.0` matters: the
server binds `127.0.0.1` by default, and a loopback bind inside the container is unreachable
through a published port.

```bash
docker run --rm -p 3000:3000 \
  -e SIGNAL_API_URL=http://host.docker.internal:8080 \
  -e SIGNAL_NUMBER=+15551234567 \
  -e SIGNAL_TRANSPORT=http \
  -e HOST=0.0.0.0 \
  -e SIGNAL_API_TOKEN=replace-with-a-long-random-string \
  signal-api-mcp
```

Build the image locally with:

```bash
docker build -t signal-api-mcp .
```

The published image runs the same way; see
[docs/transports.md](transports.md#run-the-published-docker-image) for the GHCR tags.

The image has no HEALTHCHECK. The default stdio transport opens no HTTP port to probe, so a
generic check would flag a healthy server as unhealthy. Orchestrators should rely on the process
exit code instead, or run the image in HTTP mode and probe `/v1/health` on signal-cli-rest-api.

## Publishing

A git tag starting with `v` triggers `.github/workflows/publish.yml`. The workflow runs the full
check suite first, then publishes the npm package to npmjs.org and the container to GHCR.
The image lands at `ghcr.io/barbelldwarf/signal-mcp-server`, tagged with the tag name and `latest`.

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers): the workflow
mints a short-lived OIDC token that npm verifies against the publisher record configured for
`signal-api-mcp` (repository `BarbellDwarf/signal-mcp-server`, workflow `publish.yml`). There is no
publish token stored anywhere. To change the trusted publisher, open the package on npmjs.com,
open Settings, and edit the trusted publisher entry. Start by bumping the version field, then
create the tag and push it:

```bash
npm version patch
git push --tags
```

You can also publish manually with `npm publish` after `npm run build`, as long as you are
authenticated against npmjs.org (`npm login`). Manual publishes do not carry provenance.
