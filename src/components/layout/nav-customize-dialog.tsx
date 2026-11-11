"use client"

import { useMemo, useState } from "react"
import { AlertCircle, Boxes, Loader2, Star } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { NAV_GROUPS, NAV_ITEMS, resourceTypeHref, resourceTypeNavId } from "@/lib/navigation"
import {
  navItemToFavorite,
  resourceTypeToFavorite,
  useResourceNavStore,
  type FavoriteResource,
} from "@/stores/resource-nav-store"
import { useNavAvailability } from "@/hooks/use-nav-availability"
import { useAPIDiscovery } from "@/hooks/use-api-discovery"
import { useClusterStore } from "@/stores/cluster-store"
import {
  buildResourceTypes,
  matchesResourceTypeQuery,
  resourceTypeGroupLabel,
  type ResourceTypeEntry,
} from "@/lib/resource-types"

interface NavCustomizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NavCustomizeDialog({ open, onOpenChange }: NavCustomizeDialogProps) {
  const favorites = useResourceNavStore((s) => s.favorites)
  const hidden = useResourceNavStore((s) => s.hidden)
  const toggleFavorite = useResourceNavStore((s) => s.toggleFavorite)
  const removeFavorite = useResourceNavStore((s) => s.removeFavorite)
  const toggleHidden = useResourceNavStore((s) => s.toggleHidden)
  const showAll = useResourceNavStore((s) => s.showAll)
  const reset = useResourceNavStore((s) => s.reset)

  const activeCluster = useClusterStore((s) => s.activeCluster)
  const availability = useNavAvailability()
  const { data: discovery, isLoading: discoveryLoading, error: discoveryError } =
    useAPIDiscovery({ enabled: open })
  const [search, setSearch] = useState("")

  const query = search.trim().toLowerCase()

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !query ||
            item.label.toLowerCase().includes(query) ||
            (item.description ?? "").toLowerCase().includes(query),
        ),
      })).filter((group) => group.items.length > 0),
    [query],
  )

  const pinnedTypes = useMemo(
    () =>
      favorites.filter(
        (f) =>
          !NAV_ITEMS.some((item) => item.id === f.id) &&
          (!query || f.label.toLowerCase().includes(query)),
      ),
    [favorites, query],
  )

  // Discovered types that already have a curated page are managed in the built-in
  // sections above, so they are not repeated in the catalog. Clusters and Nodes are
  // control-plane pages and never resolve to a discovered Kubernetes type.
  const curatedPlurals = useMemo(
    () => new Set(NAV_ITEMS.flatMap((item) => (item.k8sPlural ? [item.k8sPlural] : []))),
    [],
  )

  const catalogTypes = useMemo(() => {
    return buildResourceTypes(discovery)
      .filter((entry) => !curatedPlurals.has(entry.plural))
      .filter((entry) => matchesResourceTypeQuery(entry, query))
  }, [discovery, curatedPlurals, query])

  const catalogGroups = useMemo(() => {
    const byGroup = new Map<string, ResourceTypeEntry[]>()
    for (const entry of catalogTypes) {
      const group = resourceTypeGroupLabel(entry.group)
      const list = byGroup.get(group) ?? []
      list.push(entry)
      byGroup.set(group, list)
    }
    return [...byGroup.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([group, entries]) => ({
        group,
        entries: entries.sort((a, b) => a.kind.localeCompare(b.kind)),
      }))
  }, [catalogTypes])

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize tabs</DialogTitle>
          <DialogDescription>
            Pin the tabs and resource types you use most — they stay in the sidebar. Hide the
            built-in tabs you never open. Changes are saved to this browser.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search tabs, kinds or API groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {pinnedTypes.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pinned resource types
              </h3>
              <div className="space-y-1">
                {pinnedTypes.map((fav) => (
                  <FavoriteRow
                    key={fav.id}
                    favorite={fav}
                    onRemove={() => removeFavorite(fav.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {groups.map((group) => (
            <section key={group.id}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const status = availability.get(item.id)
                  const isUnavailable = status?.available === false
                  const favoriteTarget = navItemToFavorite(item.id)
                  const Icon = item.icon
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
                    >
                      <Checkbox
                        id={`tab-visible-${item.id}`}
                        checked={!hidden.includes(item.id)}
                        onCheckedChange={() => toggleHidden(item.id)}
                      />
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <label
                        htmlFor={`tab-visible-${item.id}`}
                        className="min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="block text-sm">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {isUnavailable ? status?.reason : item.description ?? item.href}
                        </span>
                      </label>
                      {isUnavailable && (
                        <span className="text-[10px] uppercase text-muted-foreground">
                          Hidden
                        </span>
                      )}
                      {favoriteTarget && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label={`Pin ${item.label}`}
                          onClick={() => toggleFavorite(favoriteTarget)}
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              favoriteIds.has(item.id)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-muted-foreground",
                            )}
                          />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                All resource types
              </h3>
              {catalogTypes.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {catalogTypes.length}
                </Badge>
              )}
            </div>

            {discoveryLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading resource types...
              </div>
            ) : discoveryError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Failed to discover resource types: {discoveryError.message}
                </span>
              </div>
            ) : !activeCluster ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Select a cluster to browse its resource types.
              </p>
            ) : catalogGroups.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {query ? "No resource types match your search" : "No resource types were discovered"}
              </p>
            ) : (
              <div className="space-y-3">
                {catalogGroups.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {group.group}
                    </div>
                    <div className="space-y-1">
                      {group.entries.map((entry) => {
                        const id = resourceTypeNavId(entry.key)
                        const isPinned = favoriteIds.has(id)
                        return (
                          <div
                            key={entry.key}
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
                          >
                            <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm">{entry.kind}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.version} · {entry.namespaced ? "Namespaced" : "Cluster"} ·{" "}
                                {entry.plural}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              aria-label={isPinned ? `Unpin ${entry.kind}` : `Pin ${entry.kind}`}
                              title={isPinned ? `Unpin ${entry.kind}` : `Pin ${entry.kind}`}
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
                                  isPinned
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground",
                                )}
                              />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {groups.length === 0 && pinnedTypes.length === 0 && catalogGroups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No tabs match your search</p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" size="sm" onClick={showAll}>
            Show all tabs
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FavoriteRow({
  favorite,
  onRemove,
}: {
  favorite: FavoriteResource
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{favorite.label}</span>
        {favorite.group !== undefined && (
          <span className="block truncate text-xs text-muted-foreground">
            {favorite.group || "core"}
            {favorite.version ? ` / ${favorite.version}` : ""}
          </span>
        )}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`Unpin ${favorite.label}`}
        onClick={onRemove}
      >
        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      </Button>
    </div>
  )
}
