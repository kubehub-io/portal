export interface AppConfig {
  apiUrl: string
  oidcConfig?: {
    issuer: string
    clientId: string
    redirectUri?: string
  }
  webShellConfig?: {
    image: string
    specVersion: string
  }
}

const DEFAULTS: AppConfig = {
  apiUrl: "",
  oidcConfig: {
    issuer: "",
    clientId: "",
  },
  webShellConfig: {
    image: "ghcr.io/kubehub-io/webshell:20260616.8",
    specVersion: "1",
  },
}

let cachedConfig: AppConfig | null = null
let fetchPromise: Promise<AppConfig> | null = null

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig

  if (!fetchPromise) {
    fetchPromise = fetch("/config.json")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load config.json (${r.status})`)
        return r.json() as Promise<AppConfig>
      })
      .then((cfg) => (cachedConfig = cfg))
      .catch(() => DEFAULTS)
  }

  return fetchPromise
}

export function getConfigSync(): AppConfig {
  return cachedConfig ?? DEFAULTS
}
