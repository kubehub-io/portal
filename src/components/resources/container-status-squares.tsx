"use client"

import { cn } from "@/lib/utils"
import {
  getContainerStatusSummaries,
  type ContainerTone,
} from "@/lib/container-status"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const TONE_CLASSES: Record<ContainerTone, string> = {
  completed: "border-zinc-400 bg-zinc-200 dark:border-zinc-500 dark:bg-zinc-500/70",
  healthy: "border-green-400 bg-green-200 dark:border-green-400 dark:bg-green-300/80",
  unhealthy: "border-orange-400 bg-orange-200 dark:border-orange-400 dark:bg-orange-300/80",
  restarted: "border-red-400 bg-red-200 dark:border-red-400 dark:bg-red-300/80",
}

interface ContainerStatusSquaresProps {
  pod: Record<string, unknown>
  className?: string
}

/** One small square per container, coloured by the container's current state. */
export function ContainerStatusSquares({ pod, className }: ContainerStatusSquaresProps) {
  const containers = getContainerStatusSummaries(pod)
  const initContainers = containers.filter((container) => container.role === "init")
  const regularContainers = containers.filter((container) => container.role === "container")
  if (containers.length === 0) return null

  const renderContainer = (container: (typeof containers)[number], index: number) => (
    <Tooltip key={`${container.role}-${container.name}-${index}`}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          role="img"
          aria-label={`${container.role === "init" ? "Init container" : "Container"} ${container.name}: ${container.stateLabel}`}
          className={cn(
            "inline-block h-3 w-3 shrink-0 rounded-[3px] border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TONE_CLASSES[container.tone],
            container.tone === "healthy" &&
              container.restartCount > 0 &&
              "border-orange-500 dark:border-orange-400",
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-0.5">
          <div className="font-medium">
            {container.role === "init" ? "Init: " : ""}{container.name}
          </div>
          <div>{container.stateLabel}</div>
          {container.restartCount > 0 && <div>Restarts: {container.restartCount}</div>}
          {container.reason && container.reason !== container.stateLabel && <div>Reason: {container.reason}</div>}
          {container.message && <div className="break-words">{container.message}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn("flex flex-wrap items-center gap-1", className)}
        aria-label="Container status"
      >
        {initContainers.map(renderContainer)}
        {initContainers.length > 0 && regularContainers.length > 0 && (
          <span className="px-0.5 text-[10px] text-muted-foreground" aria-hidden="true">→</span>
        )}
        {regularContainers.map(renderContainer)}
      </div>
    </TooltipProvider>
  )
}
