# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-slim AS build

WORKDIR /app

# Enable corepack for pnpm support (if used), install deps with npm
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy nginx config as a template for envsubst
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy the entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
