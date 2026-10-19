"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { resourceTypeHref, resourceTypeNavId } from "@/lib/navigation"
import { resourceTypeGroupLabel, type ResourceTypeEntry } from "@/lib/resource-types"
import {
  resourceTypeToFavorite,
  useResourceNavStore,
} from "@/stores/resource-nav-store"

/**
 * Pins a resource *type* to the sidebar Favorites group. Types without a curated
 * page are reached through the generic viewer, so the pinned entry links there with
 * the type preselected.
 */
export function ResourceTypeStar({
  entry,
  size = "icon",
  className,
}: {
  entry: ResourceTypeEntry
  size?: "icon" | "sm"
  className?: string
}) {
  const id = resourceTypeNavId(entry.key)
  const isFavorite = useResourceNavStore((s) => s.favorites.some((f) => f.id === id))
  const toggleFavorite = useResourceNavStore((s) => s.toggleFavorite)

  const label = isFavorite ? `Unpin ${entry.kind}` : `Pin ${entry.kind}`

  return (
    <Button
      variant="ghost"
      size={size}
      className={cn(size === "sm" ? "h-8 gap-2 text-sm" : "h-7 w-7", className)}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      onClick={() =>
        toggleFavorite(
          resourceTypeToFavorite({
            key: entry.key,
            label: entry.kind,
            group: resourceTypeGroupLabel(entry.group),
            version: entry.version,
            kind: entry.kind,
            href: resourceTypeHref(entry),
          }),
        )
      }
    >
      <Star
        className={cn(
          "h-4 w-4",
          isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
        )}
      />
      {size === "sm" && <span>{isFavorite ? "Pinned" : "Pin tab"}</span>}
    </Button>
  )
}