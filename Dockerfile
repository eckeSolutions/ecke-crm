# syntax=docker/dockerfile:1

# ecke-crm ships as a static SPA (ROADMAP.md Phase 4, "Coolify deploy") —
# the backend is the separate self-hosted Supabase stack in
# infrastructure/supabase, not part of this image.

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /app

# Vite inlines VITE_* at BUILD time — they are baked into the emitted
# bundle, not read from the container's environment at runtime. So these
# must be Coolify *build arguments*; setting them as runtime env vars on
# the service silently produces a bundle with an undefined Supabase URL
# that only fails in the browser. Neither is a secret (the anon key is
# RLS-protected — see .env.example), which is what makes baking them in
# acceptable; the service-role key must never appear here.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# --ignore-scripts so this layer caches on the lockfile alone: package.json's
# `postinstall` runs the design-system submodule build, which needs the
# submodule's full source (copied below), not just this lockfile.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# vendor/design-system is a git submodule. It must be checked out in the
# build context — Coolify's clone needs submodules enabled, otherwise the
# directory is empty and `npm run setup` fails here rather than producing
# a silently style-less app.
COPY . .
RUN npm run setup && npm run build

# ---------- runtime ----------
FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80
