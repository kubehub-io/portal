"use client"

import { useCallback, useRef } from "react"
import { AgentChat } from "@/components/chat/agent-chat"
import { ApplyPanel } from "@/components/apply/apply-panel"
import { ClusterShell } from "@/components/resources/cluster-shell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWorkbenchStore, type WorkbenchPanel } from "@/stores/workbench-store"
import {
  FilePlus,
  Maximize2,
  MessageSquare,
  Minimize2,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react"

interface PanelMeta {
  id: WorkbenchPanel
  label: string
  icon: LucideIcon
  description: string
}

/** Keep the dock usable and leave at least a sliver of the content visible. */
const MIN_PANEL_HEIGHT = 140
const MIN_CONTENT_HEIGHT = 96

const PANELS: PanelMeta[] = [
  {
    id: "chat",
    label: "Chat",
    icon: MessageSquare,
    description: "KubeHub support agent",
  },
  {
    id: "shell",
    label: "Shell",
    icon: Terminal,
    description: "Cluster shell",
  },
  {
    id: "apply",
    label: "Apply",
    icon: FilePlus,
    description: "Apply YAML manifests",
  },
]

/** Dockable panel above the workbench bar. Renders nothing when collapsed. */
export function WorkbenchPanel() {
  const active = useWorkbenchStore((s) => s.active)
  const maximized = useWorkbenchStore((s) => s.maximized)
  const height = useWorkbenchStore((s) => s.height)
  const close = useWorkbenchStore((s) => s.close)
  const toggleMaximized = useWorkbenchStore((s) => s.toggleMaximized)
  const setHeight = useWorkbenchStore((s) => s.setHeight)

  const panelRef = useRef<HTMLElement>(null)

  const clampHeight = useCallback((next: number, containerHeight: number) => {
    const max = Math.max(MIN_PANEL_HEIGHT, containerHeight - MIN_CONTENT_HEIGHT)
    return Math.round(Math.min(max, Math.max(MIN_PANEL_HEIGHT, next)))
  }, [])

  const handleResizeStart = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const panel = panelRef.current
      const container = panel?.parentElement
      if (!panel || !container) return

      const bounds = container.getBoundingClientRect()

      const onPointerMove = (pointerEvent: PointerEvent) => {
        // The panel is anchored to the bottom of the content area, so the new
        // height is the distance from the pointer to that bottom edge.
        setHeight(clampHeight(bounds.bottom - pointerEvent.clientY, bounds.height))
      }

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove)
        window.removeEventListener("pointerup", cleanup)
        window.removeEventListener("pointercancel", cleanup)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      window.addEventListener("pointermove", onPointerMove)
      window.addEventListener("pointerup", cleanup)
      window.addEventListener("pointercancel", cleanup)
      document.body.style.cursor = "ns-resize"
      document.body.style.userSelect = "none"
    },
    [clampHeight, setHeight],
  )

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      const panel = panelRef.current
      const container = panel?.parentElement
      const containerHeight = container?.getBoundingClientRect().height ?? MIN_PANEL_HEIGHT
      const current = height ?? panel?.getBoundingClientRect().height ?? MIN_PANEL_HEIGHT
      setHeight(clampHeight(current + (event.key === "ArrowUp" ? 24 : -24), containerHeight))
    },
    [clampHeight, height, setHeight],
  )

  if (!active) return null

  const meta = PANELS.find((panel) => panel.id === active)!
  const Icon = meta.icon

  return (
    <section
      ref={panelRef}
      aria-label={`${meta.label} panel`}
      style={!maximized && height ? { height, maxHeight: `calc(100% - ${MIN_CONTENT_HEIGHT}px)` } : undefined}
      className={cn(
        "flex flex-col border-t bg-background",
        maximized
          ? "absolute inset-0 z-20"
          : cn(
              "min-h-[8.75rem] shrink-0 shadow-[0_-6px_16px_rgba(0,0,0,0.06)]",
              !height && "h-1/2",
            ),
      )}
    >
      {!maximized && (
        <button
          type="button"
          aria-label="Resize panel"
          title="Drag to resize"
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          className="group flex h-2 w-full shrink-0 cursor-ns-resize touch-none select-none items-center justify-center bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="h-0.5 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/60" />
        </button>
      )}

      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{meta.label}</span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
          {meta.description}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleMaximized}
            title={maximized ? "Restore panel" : "Maximize panel"}
            aria-label={maximized ? "Restore panel" : "Maximize panel"}
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={close}
            title="Hide panel"
            aria-label="Hide panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "chat" && <AgentChat embedded />}
        {active === "shell" && <ClusterShell />}
        {active === "apply" && (
          <div className="h-full overflow-y-auto p-3">
            <ApplyPanel embedded />
          </div>
        )}
      </div>
    </section>
  )
}

/** Always-visible bottom bar that opens and closes the docked panels. */
export function WorkbenchBar() {
  const active = useWorkbenchStore((s) => s.active)
  const toggle = useWorkbenchStore((s) => s.toggle)

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-t bg-muted/40 px-2">
      <span className="mr-1 hidden px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:inline">
        Workbench
      </span>
      {PANELS.map((panel) => {
        const Icon = panel.icon
        const isActive = active === panel.id
        return (
          <Button
            key={panel.id}
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-7 gap-1.5 px-2 text-xs font-normal", isActive && "font-medium")}
            aria-pressed={isActive}
            onClick={() => toggle(panel.id)}
            title={isActive ? `Hide ${panel.label}` : `Open ${panel.label}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {panel.label}
          </Button>
        )
      })}
    </div>
  )
}
