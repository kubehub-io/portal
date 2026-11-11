import { beforeEach, describe, expect, it } from "vitest"
import { useWorkbenchStore } from "@/stores/workbench-store"

function store() {
  return useWorkbenchStore.getState()
}

describe("workbench store", () => {
  beforeEach(() => {
    useWorkbenchStore.setState({ active: null, maximized: false, height: null })
  })

  it("opens a panel and toggles it closed again", () => {
    store().toggle("chat")
    expect(store().active).toBe("chat")

    store().toggle("chat")
    expect(store().active).toBeNull()
  })

  it("switches between panels without closing the dock", () => {
    store().toggle("chat")
    store().toggle("shell")

    expect(store().active).toBe("shell")
  })

  it("remembers maximized when switching panels", () => {
    store().toggle("chat")
    store().toggleMaximized()
    store().toggle("apply")

    expect(store().active).toBe("apply")
    expect(store().maximized).toBe(true)
  })

  it("resets maximized when the dock closes", () => {
    store().toggle("chat")
    store().toggleMaximized()
    store().close()

    expect(store().active).toBeNull()
    expect(store().maximized).toBe(false)
  })

  it("keeps a dragged height across panel switches", () => {
    store().toggle("chat")
    store().setHeight(420)
    store().toggle("shell")

    expect(store().height).toBe(420)
  })
})
