import { getConfig } from "@/lib/config"

export async function oidcConfig() {
  const cfg = await getConfig()
  const oidc = cfg.oidcConfig ?? { issuer: "", clientId: "" }
  const issuer = oidc.issuer
  const redirectUri = oidc.redirectUri ?? (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "")
  return {
    issuer,
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
    endSessionEndpoint: `${issuer}/protocol/openid-connect/logout`,
    clientId: oidc.clientId,
    redirectUri,
    scope: "openid profile email",
  }
}

function base64URLEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function sha256(verifier: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
}

export async function generatePKCEChallenge(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64URLEncode(crypto.getRandomValues(new Uint8Array(64)))
  const challenge = base64URLEncode(await sha256(verifier))
  return { verifier, challenge }
}

export function generateState(): string {
  return base64URLEncode(crypto.getRandomValues(new Uint8Array(32)))
}

export async function buildAuthorizeUrl(challenge: string, state: string): Promise<string> {
  const cfg = await oidcConfig()
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: cfg.scope,
  })
  return `${cfg.authorizationEndpoint}?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  const cfg = await oidcConfig()
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    code_verifier: verifier,
    redirect_uri: cfg.redirectUri,
  })
  const res = await fetch(cfg.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = await oidcConfig()
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    refresh_token: refreshToken,
  })
  const res = await fetch(cfg.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  return res.json()
}

export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1]
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}
