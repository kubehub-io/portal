"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/auth-store"
import { exchangeCode } from "@/lib/auth/pkce"

const PKCE_KEY = "kubehub:pkce"
const STATE_KEY = "kubehub:state"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setTokens = useAuthStore((s) => s.setTokens)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    const code = searchParams.get("code")
    const stateParam = searchParams.get("state")
    const errorParam = searchParams.get("error")

    if (errorParam) {
      queueMicrotask(() => setError(`Authorization error: ${errorParam}`))
      return
    }

    if (!code || !stateParam) {
      queueMicrotask(() => setError("Invalid callback: missing code or state"))
      return
    }

    const savedState = sessionStorage.getItem(STATE_KEY)
    if (stateParam !== savedState) {
      queueMicrotask(() => setError("State mismatch - possible CSRF attack"))
      return
    }

    const verifier = sessionStorage.getItem(PKCE_KEY)
    if (!verifier) {
      queueMicrotask(() => setError("No PKCE verifier found"))
      return
    }

    sessionStorage.removeItem(PKCE_KEY)
    sessionStorage.removeItem(STATE_KEY)

    exchangeCode(code, verifier)
      .then((tokens) => {
        setTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresIn: tokens.expires_in,
        })
      })
      .then(() => router.replace("/dashboard"))
      .catch((err) => {
        queueMicrotask(() =>
          setError(`Token exchange failed: ${err instanceof Error ? err.message : String(err)}`),
        )
      })
  }, [router, searchParams, setTokens])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-md border border-destructive/50 p-6 text-destructive">
          <p className="font-semibold">Authentication Failed</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
