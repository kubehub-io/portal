import { useAuthStore } from "@/stores/auth-store"
import { getConfig } from "@/lib/config"

let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessTokenOnce(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }
  isRefreshing = true
  const state = useAuthStore.getState()
  refreshPromise = state.doRefreshToken()
  try {
    return await refreshPromise
  } finally {
    isRefreshing = false
    refreshPromise = null
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}

async function fetchWithAuth(url: string, options: RequestInit, isRetry: boolean): Promise<Response> {  const { accessToken, clearTokens } = useAuthStore.getState()
  if (!accessToken) {
    clearTokens()
    throw new Error("Not authenticated")
  }
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshAccessTokenOnce()
    if (refreshed) {
      return fetchWithAuth(url, options, true)
    }
    clearTokens()
    throw new Error("Session expired")
  }
  if (!res.ok) {
    const body = await res.text()
    let message: string
    try {
      const parsed = JSON.parse(body)
      message = parsed?.error?.message || parsed?.error || parsed?.message || body
    } catch {
      message = body || res.statusText
    }
    throw new Error(message)
  }
  return res
}

/** Authenticated request against the control plane API, relative to `apiUrl` from config.json. */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { apiUrl } = await getConfig()
  return fetchWithAuth(joinUrl(apiUrl, path), options, false)
}

export async function asItemList<T>(res: Response): Promise<T[]> {
  const data = (await res.json()) as T[] | { items?: T[] }
  return Array.isArray(data) ? data : (data.items ?? [])
}

export function readETag(res: Response): string | undefined {
  return res.headers.get("ETag") ?? undefined
}
