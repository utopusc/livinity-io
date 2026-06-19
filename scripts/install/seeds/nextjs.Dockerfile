# Canned multi-stage Next.js production Dockerfile (port 3000)
#
# This is the template referenced by `liv-deploy-schema.md` for the Next.js
# image-wrap deploy path. Use it to wrap a Next.js project into a single
# production image, then deploy that image:
#
#     docker build -t my-app:latest -f nextjs.Dockerfile .
#     deploy_app({ slug: "my-app", image: "my-app:latest", port: 3000 })
#
# REQUIREMENT: set `output: 'standalone'` in next.config.js (or next.config.mjs)
# so Next.js emits the self-contained `.next/standalone` server. Without it the
# `runner` stage below has no `server.js` to run.
#
# Runs as the non-root built-in alpine `node` user; the LivOS deploy sanitizer
# additionally enforces `no-new-privileges:true`.

# ── deps: install production + build dependencies ─────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# Copy only the manifest + lockfile first for better layer caching.
COPY package.json package-lock.json* ./
# npm is the default. For pnpm/yarn projects, replace this line with:
#   pnpm:  RUN corepack enable && pnpm install --frozen-lockfile
#   yarn:  RUN corepack enable && yarn install --frozen-lockfile
RUN npm ci

# ── builder: compile the Next.js app to a standalone bundle ───────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Disable Next.js telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1
# Requires `output: 'standalone'` in next.config.js (see header comment above).
RUN npm run build

# ── runner: minimal non-root runtime image ────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as the built-in non-root `node` user (uid/gid 1000 in the official image).
# The standalone output and static assets are owned by `node` so it can read them.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

# The LivOS deploy expects the container web port here.
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `server.js` is produced by the Next.js standalone build at the bundle root.
CMD ["node", "server.js"]
