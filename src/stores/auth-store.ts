import { create } from "zustand"
import { refreshAccessToken } from "@/lib/auth/pkce"

const STORAGE_KEY = "kubehub:auth"
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000

type TokenRefreshedCallback = (newToken: string) => void

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  idToken: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isLoading: boolean
  refreshTimerId: ReturnType<typeof setTimeout> | null
  tokenRefreshedCallbacks: Set<TokenRefreshedCallback>
  setTokens: (tokens: { accessToken: string; refreshToken?: string; idToken?: string; expiresIn: number }) => void
  clearTokens: () => void
  hydrate: () => void
  doRefreshToken: () => Promise<boolean>
  startRefreshTimer: () => void
  stopRefreshTimer: () => void
  subscribeTokenRefreshed: (cb: TokenRefreshedCallback) => () => void
}

function saveToStorage(state: Partial<AuthState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { }
}

function loadFromStorage(): Partial<AuthState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  idToken: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,
  refreshTimerId: null,
  tokenRefreshedCallbacks: new Set(),

  setTokens: ({ accessToken, refreshToken, idToken, expiresIn }) => {
    const expiresAt = Date.now() + expiresIn * 1000
    const state = {
      accessToken,
      refreshToken: refreshToken ?? null,
      idToken: idToken ?? null,
      expiresAt,
      isAuthenticated: true,
      isLoading: false,
    }
    saveToStorage(state)
    set(state)
    get().startRefreshTimer()
  },

  clearTokens: () => {
    get().stopRefreshTimer()
    clearStorage()
    set({
      accessToken: null,
      refreshToken: null,
      idToken: null,
      expiresAt: null,
      isAuthenticated: false,
      isLoading: false,
      refreshTimerId: null,
    })
  },

  hydrate: () => {
    const stored = loadFromStorage()
    if (stored?.accessToken && stored?.expiresAt && stored.expiresAt > Date.now()) {
      set({ ...stored, isAuthenticated: true, isLoading: false })
      get().startRefreshTimer()
    } else if (stored?.accessToken) {
      set({ isLoading: false })
      clearStorage()
    } else {
      set({ isLoading: false })
    }
  },

  doRefreshToken: async () => {
    const { refreshToken, clearTokens, tokenRefreshedCallbacks } = get()
    if (!refreshToken) {
      clearTokens()
      return false
    }
    try {
      const tokens = await refreshAccessToken(refreshToken)
      const expiresIn = tokens.expires_in
      const newRefreshToken = tokens.refresh_token ?? refreshToken
      get().setTokens({
        accessToken: tokens.access_token,
        refreshToken: newRefreshToken,
        idToken: tokens.id_token,
        expiresIn,
      })
      tokenRefreshedCallbacks.forEach((cb) => cb(tokens.access_token))
      return true
    } catch {
      clearTokens()
      return false
    }
  },

  startRefreshTimer: () => {
    const { expiresAt, refreshTimerId } = get()
    if (refreshTimerId) clearTimeout(refreshTimerId)
    if (!expiresAt) return

    const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS)
    const timerId = setTimeout(() => {
      get().doRefreshToken()
    }, delay)
    set({ refreshTimerId: timerId })
  },

  stopRefreshTimer: () => {
    const { refreshTimerId } = get()
    if (refreshTimerId) {
      clearTimeout(refreshTimerId)
      set({ refreshTimerId: null })
    }
  },

  subscribeTokenRefreshed: (cb) => {
    const callbacks = get().tokenRefreshedCallbacks
    callbacks.add(cb)
    return () => callbacks.delete(cb)
  },
}))
