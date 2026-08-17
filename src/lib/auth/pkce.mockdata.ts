export const MOCK_OIDC_ISSUER = "https://mock-issuer.local"
export const MOCK_OIDC_CLIENT_ID = "mock-client"
export const MOCK_OIDC_SCOPE = "openid profile email"

export const MOCK_TOKEN_PAYLOAD = {
  sub: "local-user",
  name: "Local Demo User",
  email: "demo@kubehub.local",
  preferred_username: "local-user",
  iss: MOCK_OIDC_ISSUER,
  aud: MOCK_OIDC_CLIENT_ID,
}
