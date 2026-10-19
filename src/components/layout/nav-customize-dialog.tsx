"use client"

import { useMemo, useState } from "react"
import { Star } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { NAV_GROUPS } from "@/lib/navigation"
import {
  navItemToFavorite,
  useResourceNavStore,
  type FavoriteResource,
} from "@/stores/resource-nav-store"
import { useNavAvailability } from "@/hooks/use-nav-availability"

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

  const availability = useNavAvailability()
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
    () => favorites.filter((f) => !NAV_GROUPS.some((g) => g.items.some((i) => i.id === f.id))),
    [favorites],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize resource tabs</DialogTitle>
          <DialogDescription>
            Favorite the tabs you use most — they stay pinned in the sidebar. Hide the ones you never
            open. Changes are saved to this browser.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search tabs..."
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
                              favorites.some((f) => f.id === item.id)
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

          {groups.length === 0 && (
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