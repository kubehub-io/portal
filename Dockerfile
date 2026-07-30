FROM --platform=$BUILDPLATFORM docker.io/library/node:22-alpine AS builder
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY ./package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY ./ .
RUN pnpm build

FROM docker.io/library/nginx:alpine
COPY --from=builder /app/out /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
