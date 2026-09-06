import http from "node:http"
import https from "node:https"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Handler } from "./mock/util.ts"
import { getMockCerts } from "./mock/tls.ts"
import { oidcHandler } from "./mock/oidc.ts"
import { controlPlaneHandler } from "./mock/control-plane.ts"
import { k8sHandler } from "./mock/k8s.ts"
import { MOCK_K8S_API_URL } from "./mock/data.ts"
import { handleError } from "./mock/util.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.resolve(__dirname, "../public/mock.config.json")
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
  oidcConfig?: { issuer?: string }
  apiUrl?: string
}

if (!config.oidcConfig?.issuer || !config.apiUrl) {
  console.error("[mock] public/mock.config.json must define oidcConfig.issuer and apiUrl")
  process.exit(1)
}

const issuer = new URL(config.oidcConfig.issuer)
const api = new URL(config.apiUrl)
const k8s = new URL(MOCK_K8S_API_URL)

function defaultPort(scheme: string, url: URL): number {
  if (url.port) return Number(url.port)
  return scheme === "https:" ? 443 : 80
}

function withCors(handler: Handler): Handler {
  return (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match")
    res.setHeader("Access-Control-Max-Age", "86400")
    if ((req.method ?? "GET").toUpperCase() === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }
    Promise.resolve(handler(req, res)).catch((err) => handleError(res, err))
  }
}

function startServer(name: string, scheme: string, port: number, handler: Handler, extra = ""): http.Server | https.Server {
  const wrapped = withCors(handler)
  const server = scheme === "https:"
    ? https.createServer(getMockCerts(), wrapped)
    : http.createServer(wrapped)

  server.listen(port, "localhost", () => {
    console.log(`[mock] ${name} listening on ${scheme}//localhost:${port}${extra}`)
  })

  server.on("error", (err) => {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EADDRINUSE") {
      console.error(`[mock] ${name}: port ${port} is already in use`)
    } else {
      console.error(`[mock] ${name} failed:`, err.message)
    }
    process.exit(1)
  })

  return server
}

const servers: (http.Server | https.Server)[] = [
  startServer(
    "oidc",
    issuer.protocol,
    defaultPort(issuer.protocol, issuer),
    oidcHandler(issuer),
    `${issuer.pathname.replace(/\/+$/, "")}/protocol/openid-connect/auth`,
  ),
  startServer("control-plane api", api.protocol, defaultPort(api.protocol, api), controlPlaneHandler()),
  startServer("k8s api", k8s.protocol, defaultPort(k8s.protocol, k8s), k8sHandler()),
]

if (issuer.protocol === "https:") {
  console.log("[mock] Using a self-signed certificate. Accept the browser warning for the OIDC issuer (https://localhost:3001).")
}

function shutdown(): void {
  for (const server of servers) server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

console.log("[mock] Serving mocked stage based on public/mock.config.json")
console.log(`[mock]   oidc issuer : ${issuer.protocol}//localhost:${defaultPort(issuer.protocol, issuer)}`)
console.log(`[mock]   api url     : ${api.protocol}//localhost:${defaultPort(api.protocol, api)}`)
console.log(`[mock]   k8s url     : ${k8s.protocol}//localhost:${defaultPort(k8s.protocol, k8s)}`)