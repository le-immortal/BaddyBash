# ---- Base ----
FROM node:20-alpine AS base

# ---- Dependencies ----
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for env vars needed at build time (Next.js inlines them)
ARG AUTH_SECRET
ARG AUTH_GITHUB_ID
ARG AUTH_GITHUB_SECRET
ARG COSMOS_ENDPOINT
ARG COSMOS_KEY
ARG COSMOS_DATABASE

ENV AUTH_SECRET=${AUTH_SECRET}
ENV AUTH_GITHUB_ID=${AUTH_GITHUB_ID}
ENV AUTH_GITHUB_SECRET=${AUTH_GITHUB_SECRET}
ENV COSMOS_ENDPOINT=${COSMOS_ENDPOINT}
ENV COSMOS_KEY=${COSMOS_KEY}
ENV COSMOS_DATABASE=${COSMOS_DATABASE}

RUN npm run build

# ---- Runner ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone server + static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
