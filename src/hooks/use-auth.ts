"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth-store"

export function useAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const idToken = useAuthStore((s) => s.idToken)
  const expiresAt = useAuthStore((s) => s.expiresAt)
  const clearTokens = useAuthStore((s) => s.clearTokens)

  useEffect(() => {
    useAuthStore.getState().hydrate()
  }, [])

  return { isAuthenticated, isLoading, accessToken, refreshToken, idToken, expiresAt, clearTokens }
}
