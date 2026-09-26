import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useActiveAlerts } from "@/hooks/use-monitoring"
import { useAuthStore } from "@/stores/auth-store"
import { listAlerts } from "@/lib/api/monitoring"
import type { Alert } from "@/lib/api/monitoring"

vi.mock("@/lib/api/monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/monitoring")>()),
  listAlerts: vi.fn(),
}))

const listAlertsMock = vi.mocked(listAlerts)

function alert(name: string): Alert {
  return {
    labels: { alertname: name, severity: "critical" },
    status: { state: "active" },
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe("useActiveAlerts polling", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    useAuthStore.setState({ accessToken: "token", isAuthenticated: true, clearTokens: () => {} })
    listAlertsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("fetches once on mount", async () => {
    listAlertsMock.mockResolvedValue([alert("NodeDown")])
    const { result } = renderHook(() => useActiveAlerts(), { wrapper })
    await waitFor(() => expect(result.current.alerts).toHaveLength(1))
    expect(listAlertsMock).toHaveBeenCalledTimes(1)
  })

  it("keeps polling every two minutes", async () => {
    listAlertsMock.mockResolvedValue([alert("NodeDown")])
    renderHook(() => useActiveAlerts(), { wrapper })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(1))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(119_000)
    })
    expect(listAlertsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(2))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(3))
  })

  it("keeps polling while the tab is in the background", async () => {
    listAlertsMock.mockResolvedValue([alert("NodeDown")])
    renderHook(() => useActiveAlerts(), { wrapper })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(1))

    // refetchOnWindowFocus is disabled app wide, so background polling is the
    // only thing that keeps this list fresh.
    document.dispatchEvent(new Event("visibilitychange"))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(2))
  })

  it("surfaces alerts that appear on a later poll", async () => {
    listAlertsMock.mockResolvedValueOnce([]).mockResolvedValue([alert("NodeDown")])
    const { result } = renderHook(() => useActiveAlerts(), { wrapper })
    await waitFor(() => expect(listAlertsMock).toHaveBeenCalledTimes(1))
    expect(result.current.alerts).toHaveLength(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    await waitFor(() => expect(result.current.alerts).toHaveLength(1))
  })
})
