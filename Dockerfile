FROM --platform=$BUILDPLATFORM docker.io/library/node:22-alpine AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY ./ .
RUN pnpm build

# will be publish as image volume
FROM scratch
COPY --from=builder /app/out /site
COPY ./nginx.conf /config/nginx.conf
