# syntax=docker/dockerfile:1.7
# ── stage 1: build ─────────────────────────────────────────
FROM node:20.18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── stage 2: production (nginx static serve) ──────────────
FROM nginx:1.27-alpine AS production
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# ── stage 3: dev server (HMR for docker compose) ──────────
FROM node:20.18-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5171
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","5171"]
