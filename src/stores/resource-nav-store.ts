import { create } from "zustand"
import { getNavItem, resourceTypeNavId } from "@/lib/navigation"

const RESOURCE_NAV_KEY = "kubehub:resourceNav"

/**
 * A pinned entry in the Favorites group. First-class pages are referenced by their
 * nav item id; arbitrary resource types (CRDs, including system ones) carry their
 * API coordinates and render through the generic viewer.
 */
export interface FavoriteResource {
  id: string
  label: string
  href: string
  group?: string
  version?: string
  kind?: string
  addedAt: number
}

export interface ResourceNavState {
  favorites: FavoriteResource[]
  hidden: string[]
  hydrated: boolean
  isFavorite: (id: string) => boolean
  toggleFavorite: (favorite: Omit<FavoriteResource, "addedAt">) => void
  removeFavorite: (id: string) => void
  isHidden: (id: string) => boolean
  toggleHidden: (id: string) => void
  showAll: () => void
  reset: () => void
  hydrate: () => void
}

interface PersistedResourceNav {
  favorites?: FavoriteResource[]
  hidden?: string[]
}

function load(): PersistedResourceNav {
  try {
    const raw = localStorage.getItem(RESOURCE_NAV_KEY)
    return raw ? (JSON.parse(raw) as PersistedResourceNav) : {}
  } catch {
    return {}
  }
}

function sanitizeFavorites(value: unknown): FavoriteResource[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: FavoriteResource[] = []
  for (const entry of value) {
    const fav = entry as Partial<FavoriteResource>
    if (!fav || typeof fav.id !== "string" || typeof fav.href !== "string") continue
    if (seen.has(fav.id)) continue
    seen.add(fav.id)
    result.push({
      id: fav.id,
      label: typeof fav.label === "string" ? fav.label : fav.id,
      href: fav.href,
      group: typeof fav.group === "string" ? fav.group : undefined,
      version: typeof fav.version === "string" ? fav.version : undefined,
      kind: typeof fav.kind === "string" ? fav.kind : undefined,
      addedAt: typeof fav.addedAt === "number" ? fav.addedAt : Date.now(),
    })
  }
  return result
}

function sanitizeHidden(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === "string"))]
}

function persist(state: Pick<ResourceNavState, "favorites" | "hidden">) {
  try {
    localStorage.setItem(
      RESOURCE_NAV_KEY,
      JSON.stringify({ favorites: state.favorites, hidden: state.hidden }),
    )
  } catch { }
}

export function navItemToFavorite(id: string): Omit<FavoriteResource, "addedAt"> | null {
  const item = getNavItem(id)
  if (!item) return null
  return { id: item.id, label: item.label, href: item.href }
}

export function resourceTypeToFavorite(entry: {
  key: string
  label: string
  href: string
  group: string
  version: string
  kind: string
}): Omit<FavoriteResource, "addedAt"> {
  return {
    id: resourceTypeNavId(entry.key),
    label: entry.label,
    href: entry.href,
    group: entry.group,
    version: entry.version,
    kind: entry.kind,
  }
}

export const useResourceNavStore = create<ResourceNavState>((set, get) => ({
  favorites: [],
  hidden: [],
  hydrated: false,

  isFavorite: (id) => get().favorites.some((f) => f.id === id),

  toggleFavorite: (favorite) => {
    const { favorites } = get()
    const exists = favorites.some((f) => f.id === favorite.id)
    const next = exists
      ? favorites.filter((f) => f.id !== favorite.id)
      : [...favorites, { ...favorite, addedAt: Date.now() }]
    set({ favorites: next })
    persist({ favorites: next, hidden: get().hidden })
  },

  removeFavorite: (id) => {
    const next = get().favorites.filter((f) => f.id !== id)
    set({ favorites: next })
    persist({ favorites: next, hidden: get().hidden })
  },

  isHidden: (id) => get().hidden.includes(id),

  toggleHidden: (id) => {
    const { hidden } = get()
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
    set({ hidden: next })
    persist({ favorites: get().favorites, hidden: next })
  },

  showAll: () => {
    const hidden: string[] = []
    set({ hidden })
    persist({ favorites: get().favorites, hidden })
  },

  reset: () => {
    set({ favorites: [], hidden: [] })
    try {
      localStorage.removeItem(RESOURCE_NAV_KEY)
    } catch { }
  },

  hydrate: () => {
    if (get().hydrated) return
    const stored = load()
    set({
      favorites: sanitizeFavorites(stored.favorites),
      hidden: sanitizeHidden(stored.hidden),
      hydrated: true,
    })
  },
}))