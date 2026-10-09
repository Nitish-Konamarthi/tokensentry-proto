# ═══════════════════════════════════════════════════════════
# TOKENSENTRY — Multi-stage Dockerfile
# Stage 1: deps    — install all npm packages
# Stage 2: builder — TypeScript compile
# Stage 3: runner  — minimal production image
# Stage 4: development — hot reload with tsx
# ═══════════════════════════════════════════════════════════

ARG NODE_VERSION=22

# ── Stage 1: deps ─────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install all deps (including dev — needed for tsx in dev stage)
RUN npm ci

# ── Stage 2: builder ──────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Compile TypeScript
RUN npm run build
# Prune dev dependencies
RUN npm prune --production

# ── Stage 3: runner (production) ──────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 tokensentry

# Copy only what's needed for production
COPY --from=builder --chown=tokensentry:nodejs /app/dist ./dist
COPY --from=builder --chown=tokensentry:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=tokensentry:nodejs /app/package.json ./package.json

USER tokensentry

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Health check for Kubernetes readiness probe
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "dist/index.js"]

# ── Stage 4: development (hot reload) ─────────────────────
FROM node:${NODE_VERSION}-alpine AS development
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 tokensentry

COPY --from=deps --chown=tokensentry:nodejs /app/node_modules ./node_modules
COPY --chown=tokensentry:nodejs package*.json tsconfig.json ./
COPY --chown=tokensentry:nodejs src/ ./src/

USER tokensentry

ENV NODE_ENV=development
EXPOSE 3000

CMD ["npm", "run", "dev"]
