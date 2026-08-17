import { vi } from "vitest"
import { writeFileSync, mkdirSync } from "node:fs"
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

const NOTE = /Requires at least one node onboarded/i

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

  it("keeps the target node selector and node warning on one compact row", async () => {
    const { container } = renderShell()

    const targetNodeRow = screen.getByText(/Target node:/i).closest("div")
    expect(targetNodeRow).toBeInTheDocument()
    expect(targetNodeRow).toHaveTextContent(/Requires at least one node onboarded/i)
    expect(targetNodeRow).toHaveTextContent(/temporary shell pod/i)
    expect(targetNodeRow).toHaveTextContent(/lost when the pod restarts/i)
    expect(screen.queryByText(/temporary shell pod/i)?.closest("div")).toBe(targetNodeRow)

    mkdirSync("/tmp/opencode", { recursive: true })
    writeFileSync(
      "/tmp/opencode/shell-preview.html",
      `<!doctype html><html><head><meta charset="utf-8"><title>Shell preview</title></head>
<body style="font-family: system-ui, sans-serif; margin: 0; background: #f8fafc;">
${container.innerHTML}
</body></html>`,
    )
  })
})