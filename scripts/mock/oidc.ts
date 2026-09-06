import type { Handler } from "./util.ts"
import { MOCK_TOKEN_PAYLOAD } from "./data.ts"
import { readBody, sendJson } from "./util.ts"

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url")
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function buildTokenPayload(issuer: string, clientId: string) {
  return {
    ...MOCK_TOKEN_PAYLOAD,
    iss: issuer,
    aud: clientId,
    iat: nowSec(),
    exp: nowSec() + 3600,
  }
}

function buildJwt(issuer: string, clientId: string): string {
  const header = { alg: "none", typ: "JWT" }
  const payload = buildTokenPayload(issuer, clientId)
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.mock-signature`
}

function tokenResponse(issuer: string, clientId: string) {
  return {
    access_token: buildJwt(issuer, clientId),
    refresh_token: `mock-refresh-${base64url(String(nowSec()))}`,
    id_token: buildJwt(issuer, clientId),
    expires_in: 3600,
    token_type: "Bearer",
  }
}

function safeRedirectUri(redirectUri: string | null): string {
  if (!redirectUri) return "/"
  if (!redirectUri.startsWith("/")) return "/"
  if (redirectUri.startsWith("//")) return "/"
  return redirectUri
}

function redirectUrl(redirectUri: string, state: string | null): string {
  const sep = redirectUri.includes("?") ? "&" : "?"
  return `${redirectUri}${sep}code=mock-code&state=${state ?? ""}`
}

export function oidcHandler(issuer: URL): Handler {
  const base = issuer.pathname.replace(/\/+$/, "")
  const issuerStr = issuer.toString().replace(/\/+$/, "")
  const clientId = "publicClient"

  return async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const path = url.pathname
    const method = (req.method ?? "GET").toUpperCase()

    if ((path === "/.well-known/openid-configuration" || path === `${base}/.well-known/openid-configuration`) && method === "GET") {
      return sendJson(res, 200, {
        issuer: issuerStr,
        authorization_endpoint: `${issuerStr}/protocol/openid-connect/auth`,
        token_endpoint: `${issuerStr}/protocol/openid-connect/token`,
        end_session_endpoint: `${issuerStr}/protocol/openid-connect/logout`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        subject_types_supported: ["public"],
        token_endpoint_auth_methods_supported: ["none"],
      })
    }

    if (path === `${base}/protocol/openid-connect/auth` && method === "GET") {
      const redirectUri = safeRedirectUri(url.searchParams.get("redirect_uri"))
      res.writeHead(302, { Location: redirectUrl(redirectUri, url.searchParams.get("state")) })
      return res.end()
    }

    if (path === `${base}/protocol/openid-connect/token` && method === "POST") {
      const body = (await readBody(req)).toString("utf8")
      const params = new URLSearchParams(body)
      const grantType = params.get("grant_type")
      if (grantType === "authorization_code") {
        return sendJson(res, 200, tokenResponse(issuerStr, clientId))
      }
      if (grantType === "refresh_token") {
        return sendJson(res, 200, tokenResponse(issuerStr, clientId))
      }
      return sendJson(res, 400, { error: "unsupported_grant_type", error_description: `Unsupported grant_type: ${grantType}` })
    }

    if (path === `${base}/protocol/openid-connect/logout` && method === "GET") {
      res.writeHead(302, { Location: "/" })
      return res.end()
    }

    return sendJson(res, 404, { error: "Not found", path })
  }
}