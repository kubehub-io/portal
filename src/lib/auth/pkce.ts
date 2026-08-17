import { getConfig } from "@/lib/config"

function loadPkceMockData() {
  return require("./pkce.mockdata.ts") as typeof import("./pkce.mockdata.ts")
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  token_type: string
}

export function isMockModeEnabled(): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search)
    if (params.get("mock") === "true" || params.get("mock") === "1") return true
    const saved = window.localStorage.getItem("kubehub:mockMode")
    if (saved === "true" || saved === "1") return true
  }

  const envValue = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_USE_MOCKS : undefined
  return envValue === "true" || envValue === "1"
}

function base64Encode(value: string): string {
  if (typeof window !== "undefined" && typeof btoa === "function") {
    return btoa(value)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }

  throw new Error("Base64 encoding is not available in this environment")
}

function toJwt(payload: Record<string, unknown>): string {
  const header = base64Encode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const claims = base64Encode(JSON.stringify(payload))
  return `${header}.${claims}.mock-signature`
}

export function getMockTokenResponse(refreshToken = "mock-refresh-token"): TokenResponse {
  const { MOCK_TOKEN_PAYLOAD } = loadPkceMockData()
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    ...MOCK_TOKEN_PAYLOAD,
    iat: now,
    exp: now + 3600,
  }

  return {
    access_token: "mock-access-token",
    refresh_token: refreshToken,
    id_token: toJwt(payload),
    expires_in: 3600,
    token_type: "Bearer",
  }
}

export async function oidcConfig() {
  if (isMockModeEnabled()) {
    const { MOCK_OIDC_CLIENT_ID, MOCK_OIDC_ISSUER, MOCK_OIDC_SCOPE } = loadPkceMockData()
    const issuer = MOCK_OIDC_ISSUER
    const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : "http://localhost:3000/auth/callback"
    return {
      issuer,
      authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
      tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
      endSessionEndpoint: `${issuer}/protocol/openid-connect/logout`,
      clientId: MOCK_OIDC_CLIENT_ID,
      redirectUri,
      scope: MOCK_OIDC_SCOPE,
    }
  }

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
  if (isMockModeEnabled()) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
    return `${origin}/auth/callback?code=mock-code&state=${state}`
  }

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

export async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
  if (isMockModeEnabled() || code === "mock-code") {
    return getMockTokenResponse()
  }

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
  if (isMockModeEnabled()) {
    return getMockTokenResponse(refreshToken)
  }

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
    if (token.startsWith("mock-")) {
      return loadPkceMockData().MOCK_TOKEN_PAYLOAD
    }

    const payload = token.split(".")[1]
    return JSON.parse(atob(payload))
  } catch {
    return null
  }
}
