import { cn } from "@/lib/utils"
import {
  getHttpRouteConditions,
  getHttpRouteRuleLines,
} from "@/lib/http-route"

const CONDITION_STYLES: Record<string, string> = {
  True: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  False: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  Unknown: "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
}

/** Accepted / ResolvedRefs badges read from a route's status. */
export function HttpRouteConditions({ route }: { route: Record<string, unknown> }) {
  const conditions = getHttpRouteConditions(route)
  if (conditions.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {conditions.map((condition) => {
        const detail = [condition.reason, condition.message].filter(Boolean).join(" — ")
        return (
          <span
            key={condition.type}
            title={`${condition.type}: ${condition.status}${detail ? ` (${detail})` : ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
              CONDITION_STYLES[condition.status] ??
                "border-border bg-muted text-muted-foreground",
            )}
          >
            <span>{condition.type}</span>
            <span className="opacity-80">{condition.status}</span>
          </span>
        )
      })}
    </div>
  )
}

/** `path => backend:port` mapping shared by HttpRoute and HubHttpRoute. */
export function HttpRouteRules({ route }: { route: Record<string, unknown> }) {
  const lines = getHttpRouteRuleLines(route)
  if (lines.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => (
        <div key={index} className="text-xs font-mono">
          {`${line.match} => ${line.backend}`}
        </div>
      ))}
    </div>
  )
}
