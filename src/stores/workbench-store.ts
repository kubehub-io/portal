import { create } from "zustand"

export type WorkbenchPanel = "chat" | "shell" | "apply"

interface WorkbenchState {
  /** Panel docked above the bottom bar, or null when the workbench is hidden. */
  active: WorkbenchPanel | null
  /** Panel fills the content pane instead of the bottom half. */
  maximized: boolean
  /** Dragged panel height in pixels. Null uses the default half-height dock. */
  height: number | null
  toggle: (panel: WorkbenchPanel) => void
  close: () => void
  toggleMaximized: () => void
  setHeight: (height: number) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  active: null,
  maximized: false,
  height: null,

  toggle: (panel) => {
    const isActive = get().active === panel
    set({
      active: isActive ? null : panel,
      maximized: isActive ? false : get().maximized,
    })
  },

  close: () => set({ active: null, maximized: false }),

  toggleMaximized: () => set({ maximized: !get().maximized }),

  setHeight: (height) => set({ height }),
}))
