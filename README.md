# KubeHub Dashboard

A pure web-based Kubernetes dashboard for Kubehub users to manage resources.

## Tech Stack
- **Next.js 16** (App Router)
- **Tailwind v4** + **shadcn/ui**
- **Zustand** (client state) + **TanStack Query** (server data)
- **OIDC PKCE** with Keycloak

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
pnpm build
pnpm start
```

## Test
```
NEXT_PUBLIC_USE_MOCKS=true pnpm run dev
```

## Architecture

- **No backend** — pure browser app, talks to kubehub(control-plane) API and Kubernetes(data-plane) API.
- **Control Plane API** — cluster management (CRUD, kubeconfig download)
- **Dataplane API** — browser calls each cluster's K8s API directly at `https://{publicDns}:8443`
- **Auth** — OIDC PKCE flow, tokens stored in localStorage, auto-refresh via refresh token
- **API versioning** — K8s API group discovery handles v1 vs v1beta1 differences

## Configuration

Copy `.env.example` to `.env.local` and set:
- `NEXT_PUBLIC_API_URL` — control plane base URL (defaults to same origin)
