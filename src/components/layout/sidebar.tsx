"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useClusters } from "@/hooks/use-clusters"
import { useNavAvailability } from "@/hooks/use-nav-availability"
import {
  LayoutDashboard,
  Boxes,
  Loader2,
  PanelLeftClose,
  PanelLeft,
  Settings2,
  Star,
  EyeOff,
  X,
  type LucideIcon,
} from "lucide-react"
import { NAV_GROUPS, getNavItem, isNavItemActive } from "@/lib/navigation"
import {
  navItemToFavorite,
  useResourceNavStore,
  type FavoriteResource,
} from "@/stores/resource-nav-store"
import { NavCustomizeDialog } from "@/components/layout/nav-customize-dialog"

interface DisplayItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Shown greyed out because the cluster cannot serve the tab right now. */
  unreachable: boolean
  reason?: string
}

function hrefPath(href: string): string {
  const idx = href.indexOf("?")
  return idx === -1 ? href : href.slice(0, idx)
}

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarFrame />}>
      <SidebarContent />
    </Suspense>
  )
}

function SidebarFrame() {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <LayoutDashboard className="h-5 w-5 shrink-0 text-primary" />
        <span className="font-semibold">KubeHub</span>
      </div>
    </aside>
  )
}

function SidebarContent() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { clusters, activeCluster, setActiveCluster, isLoading } = useClusters()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const favorites = useResourceNavStore((s) => s.favorites)
  const hidden = useResourceNavStore((s) => s.hidden)
  const hydrate = useResourceNavStore((s) => s.hydrate)
  const toggleFavorite = useResourceNavStore((s) => s.toggleFavorite)
  const toggleHidden = useResourceNavStore((s) => s.toggleHidden)
  const removeFavorite = useResourceNavStore((s) => s.removeFavorite)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const availability = useNavAvailability()
  const clusterDns = activeCluster?.status.publicDns
  const isClusterStopped = activeCluster?.status?.state?.toLowerCase() === "stopped"

  const isActive = (item: { href: string; id: string }) => {
    const navItem = getNavItem(item.id)
    if (navItem) return isNavItemActive(pathname, navItem)
    if (pathname !== hrefPath(item.href)) return false
    // Pinned resource types share the generic viewer route — match on the type param.
    const expected = new URLSearchParams(item.href.split("?")[1] ?? "").get("type")
    return expected ? searchParams.get("type") === expected : true
  }

  const favoriteItems: DisplayItem[] = favorites.map((fav: FavoriteResource) => {
    const navItem = getNavItem(fav.id)
    return {
      id: fav.id,
      label: fav.label,
      href: fav.href,
      icon: navItem?.icon ?? Boxes,
      unreachable: false,
    }
  })

  const pinnedIds = new Set(favorites.map((f) => f.id))

  const groups = NAV_GROUPS.map((group) => {
    const items: DisplayItem[] = []
    for (const item of group.items) {
      if (pinnedIds.has(item.id)) continue
      const status = availability.get(item.id)
      const isHidden = hidden.includes(item.id)
      // A tab gated off by a cluster feature stays out of the sidebar unless pinned.
      if (isHidden || status?.available === false) continue
      items.push({
        id: item.id,
        label: item.label,
        href: item.href,
        icon: item.icon,
        unreachable: status?.unreachable ?? false,
        reason: status?.reason,
      })
    }
    return { ...group, items }
  }).filter((group) => group.items.length > 0)

  const hiddenCount = hidden.length

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto p-2">
      {favoriteItems.length > 0 && (
        <div className="mb-2">
          {!collapsed && (
            <div className="flex items-center px-2 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Favorites
              </span>
            </div>
          )}
          {favoriteItems.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              collapsed={collapsed}
              active={isActive(item)}
              onNavigate={onNavigate}
              onUnpin={() => removeFavorite(item.id)}
            />
          ))}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="mb-2">
          {!collapsed && (
            <div className="px-2 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
            </div>
          )}
          {group.items.map((item) => (
            <NavRow
              key={item.id}
              item={item}
              collapsed={collapsed}
              active={isActive(item)}
              onNavigate={onNavigate}
              onFavorite={() => {
                const target = navItemToFavorite(item.id)
                if (target) toggleFavorite(target)
              }}
              onHide={() => toggleHidden(item.id)}
            />
          ))}
        </div>
      ))}
    </nav>
  )

  const clusterSelector = (
    <>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading clusters...
        </div>
      ) : clusters.length === 0 ? (
        <div className="text-xs text-muted-foreground">No clusters found</div>
      ) : (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Active Cluster</div>
          <Select
            value={activeCluster?.metadata.name ?? ""}
            onValueChange={(name) => {
              const c = clusters.find((cl) => cl.metadata.name === name)
              if (c) setActiveCluster(c)
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select cluster" />
            </SelectTrigger>
            <SelectContent>
              {clusters.map((c) => {
                const stopped = c.status?.state?.toLowerCase() === "stopped"
                return (
                  <SelectItem key={c.metadata.name} value={c.metadata.name}>
                    {c.metadata.name}
                    {stopped && <span className="ml-2 text-muted-foreground">(Stopped)</span>}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          {isClusterStopped ? (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="relative flex h-2 w-2 rounded-full bg-destructive" />
              <span className="text-[10px] text-muted-foreground">Stopped</span>
            </div>
          ) : clusterDns ? (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="truncate text-[10px] text-muted-foreground">{clusterDns}</span>
            </div>
          ) : null}
        </div>
      )}
    </>
  )

  const customizeButton = (
    <div className="border-t p-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn("w-full justify-start gap-2 px-2 text-sm font-normal", collapsed && "justify-center px-0")}
        onClick={() => {
          setCustomizeOpen(true)
          setMobileOpen(false)
        }}
        title={collapsed ? "Customize tabs" : undefined}
      >
        <Settings2 className="h-4 w-4" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Customize tabs</span>
            {hiddenCount > 0 && (
              <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {hiddenCount} hidden
              </span>
            )}
          </>
        )}
      </Button>
    </div>
  )

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-3 z-50 h-8 w-8 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r bg-sidebar transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <LayoutDashboard className="h-5 w-5 shrink-0 text-primary" />
          {!collapsed && <span className="font-semibold">KubeHub</span>}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 shrink-0"
            onClick={() => setCollapsed(!collapsed)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {!collapsed && <div className="border-b p-3">{clusterSelector}</div>}

        {renderNav()}
        {customizeButton}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col border-r bg-sidebar shadow-lg">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                <span className="font-semibold">KubeHub</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMobileOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="border-b p-3">{clusterSelector}</div>
            {renderNav(() => setMobileOpen(false))}
            {customizeButton}
          </aside>
        </div>
      )}

      <NavCustomizeDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
    </>
  )
}

interface NavRowProps {
  item: DisplayItem
  collapsed: boolean
  active: boolean
  onNavigate?: () => void
  onFavorite?: () => void
  onHide?: () => void
  onUnpin?: () => void
}

function NavRow({
  item,
  collapsed,
  active,
  onNavigate,
  onFavorite,
  onHide,
  onUnpin,
}: NavRowProps) {
  const Icon = item.icon
  return (
    <div className="group/nav relative">
      <Button
        variant={active ? "secondary" : "ghost"}
        size="sm"
        asChild
        className={cn(
          "w-full justify-start gap-2 px-2 text-sm font-normal",
          collapsed && "justify-center px-0",
          active && "bg-accent font-medium",
          item.unreachable && "opacity-50 pointer-events-none",
        )}
        title={collapsed ? item.label : item.reason}
        onClick={onNavigate}
      >
        <Link href={item.href}>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
      </Button>

      {!collapsed && (
        <div
          className={cn(
            "absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 rounded px-0.5 opacity-0 transition-opacity",
            "group-focus-within/nav:opacity-100 group-hover/nav:opacity-100",
            active ? "bg-accent" : "bg-sidebar",
          )}
        >
          {onUnpin ? (
            <RowAction label={`Unpin ${item.label}`} onClick={onUnpin}>
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            </RowAction>
          ) : (
            <>
              {onFavorite && (
                <RowAction label={`Pin ${item.label}`} onClick={onFavorite}>
                  <Star className="h-3.5 w-3.5" />
                </RowAction>
              )}
              {onHide && (
                <RowAction label={`Hide ${item.label}`} onClick={onHide}>
                  <EyeOff className="h-3.5 w-3.5" />
                </RowAction>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </Button>
  )
}