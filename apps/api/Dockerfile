# ---------------------------------------------------------------------------
# Multi-stage build — node:22-slim, pnpm via corepack
# ---------------------------------------------------------------------------

# --- Base -------------------------------------------------------------------
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# --- Build ------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json nest-cli.json ./
COPY src/ ./src/
RUN pnpm run build

# --- Production -------------------------------------------------------------
FROM node:22-slim AS production
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
WORKDIR /app

# Copy only production dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output
COPY --from=build /app/dist ./dist

# Non-root user
RUN addgroup --system --gid 1001 eden && \
    adduser --system --uid 1001 --ingroup eden eden
USER eden

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1})"

CMD ["node", "dist/main.js"]
