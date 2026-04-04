# ─────────────────────────────────────────────────────────
# Chain Pong Backend — Production Dockerfile
# Persistent Node.js container for Express + Socket.IO
# Deploy to Railway, Render, or DigitalOcean App Platform
# ─────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps (cache layer)
COPY package.json package-lock.json* yarn.lock* ./
COPY prisma ./prisma/
RUN npm ci --include=dev

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S chainpong && \
    adduser -S chainpong -u 1001 -G chainpong

# Copy production deps only
COPY package.json package-lock.json* yarn.lock* ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/dist ./dist/

# Set ownership
RUN chown -R chainpong:chainpong /app
USER chainpong

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-4000}/api/health || exit 1

EXPOSE ${PORT:-4000}

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
