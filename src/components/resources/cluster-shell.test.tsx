import { vi } from "vitest"
import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ClusterShell } from "@/components/resources/cluster-shell"

vi.mock("@/hooks/use-cluster-shell", () => ({
  useClusterShell: () => ({
    phase: "checking",
    error: null,
    podName: null,
    namespace: null,
    podNodeName: null,
    start: vi.fn(),
    retry: vi.fn(),
  }),
}))

vi.mock("@/stores/cluster-store", () => ({
  useClusterStore: (selector: (s: unknown) => unknown) =>
    selector({
      activeCluster: null,
    }),
}))

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      isAuthenticated: false,
    }),
}))

describe("ClusterShell", () => {
  function renderShell() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(<ClusterShell />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })
  }

  it("does not add an extra sandbox banner above the terminal", async () => {
    renderShell()

    expect(screen.queryByText(/Agent Sandbox shell/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/same sandbox pod is reused while this browser tab remains open/i)).not.toBeInTheDocument()
  })
})
