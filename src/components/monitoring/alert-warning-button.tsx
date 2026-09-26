"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useActiveAlerts } from "@/hooks/use-monitoring"
import { useNow } from "@/hooks/use-now"
import {
  alertEntity,
  alertName,
  alertStartsAt,
  countBySeverity,
  formatAlertAge,
  getAlertSeverity,
  highestSeverity,
  type Alert,
  type AlertSeverity,
} from "@/lib/api/monitoring"
import { BellRing, Loader2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

const SEVERITY_BADGE: Record<AlertSeverity, "destructive" | "warning" | "info" | "secondary"> = {
  critical: "destructive",
  warning: "warning",
  info: "info",
  none: "secondary",
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  none: "none",
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function AlertRow({ alert, now }: { alert: Alert; now: number }) {
  const severity = getAlertSeverity(alert)
  const summary = alert.annotations?.summary
  const description = alert.annotations?.description
  const cluster = alert.labels?.cluster
  const region = alert.region
  const entity = alertEntity(alert)
  const receivers = (alert.receivers ?? []).map((r) => r.name).filter(Boolean) as string[]

  return (
    <div className="w-full rounded-md px-2 py-2 transition-colors hover:bg-accent">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{alertName(alert)}</p>
        <Badge variant={SEVERITY_BADGE[severity]} className="shrink-0">
          {SEVERITY_LABEL[severity]}
        </Badge>
      </div>
      {(summary || description) && (
        <div className="mt-1 w-full space-y-0.5">
          {summary && <p className="w-full break-words text-xs leading-relaxed">{summary}</p>}
          {description && description !== summary && (
            <p className="w-full break-words text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="mt-1.5 flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="shrink-0">for {formatAlertAge(alert, now)}</span>
        {entity && <span className="min-w-0 truncate">{entity}</span>}
        {cluster && <span className="shrink-0">cluster {cluster}</span>}
        {region && <span className="shrink-0">{region}</span>}
        {receivers.length > 0 && <span className="shrink-0">{receivers.join(", ")}</span>}
      </div>
    </div>
  )
}

export function AlertWarningButton() {
  const [open, setOpen] = useState(false)
  const { alerts, isLoading, isError, dataUpdatedAt } = useActiveAlerts()
  const now = useNow(15_000)

  // Only surface the indicator once we know there is something to report.
  if (isLoading || isError || alerts.length === 0) {
    return null
  }

  const severity = highestSeverity(alerts)
  const counts = countBySeverity(alerts)
  const isCritical = severity === "critical"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", isCritical ? "text-destructive" : "text-yellow-600 dark:text-yellow-500")}
          title={`${alerts.length} active alert${alerts.length === 1 ? "" : "s"}`}
          aria-label={`${alerts.length} active alerts`}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TriangleAlert className="h-4 w-4" />
          )}
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
              isCritical ? "bg-destructive" : "bg-yellow-500",
            )}
          >
            {alerts.length > 99 ? "99+" : alerts.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[26rem] p-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <TriangleAlert
            className={cn("h-4 w-4", isCritical ? "text-destructive" : "text-yellow-600 dark:text-yellow-500")}
          />
          <p className="text-sm font-semibold">Active alerts</p>
          <span className="ml-auto text-xs text-muted-foreground">
            {dataUpdatedAt ? `updated ${formatDuration(now - dataUpdatedAt)} ago` : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
          {(Object.keys(counts) as AlertSeverity[])
            .filter((key) => counts[key] > 0)
            .map((key) => (
              <Badge key={key} variant={SEVERITY_BADGE[key]}>
                {counts[key]} {SEVERITY_LABEL[key]}
              </Badge>
            ))}
        </div>
        <div className="max-h-96 space-y-0.5 overflow-y-auto border-t p-1">
          {alerts.map((alert, i) => (
            <AlertRow
              key={
                alert.fingerprint ??
                `${alert.labels?.alertname ?? "alert"}-${alertStartsAt(alert) ?? i}-${i}`
              }
              alert={alert}
              now={now}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <BellRing className="h-3.5 w-3.5" />
          Configure routing under Settings &rsaquo; Notification settings
        </div>
      </PopoverContent>
    </Popover>
  )
}
