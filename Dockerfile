# ---- Build stage: compile the self-contained bundle ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.test.json eslint.config.js ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ---- Runtime stage: only the bundle + node, no node_modules needed ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
# run as the unprivileged node user
USER node
EXPOSE 3000

# signal-api-mcp is self-contained: it runs with just the bundled dist/index.js.
# Default transport is stdio (used by MCP clients that spawn a process).
# For remote hosting (e.g. MetaMCP) set SIGNAL_TRANSPORT=http (and HOST/PORT).
# See .env.example for the full list of environment variables.
CMD ["node", "dist/index.js"]
