"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
import {
  LayoutDashboard,
  Server,
  Layers,
  Activity,
  Network,
  Share2,
  HardDrive,
  Database,
  FileJson,
  Key,
  Boxes,
  Container,
  Loader2,
  Globe,
  PanelLeftClose,
  PanelLeft,
  X,
  Terminal,
  FilePlus,
} from "lucide-react"
import { useState } from "react"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

interface NavGroup {
  label: string
  items: NavItem[]
}

export function Sidebar() {
  const pathname = usePathname()
  const { clusters, activeCluster, setActiveCluster, isLoading } = useClusters()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const clusterDns = activeCluster?.status.publicDns
  const managedIngress = activeCluster?.spec?.managedIngressProfile?.enabled !== false
  const isClusterStopped = activeCluster?.status?.state?.toLowerCase() === "stopped"

  const groups: NavGroup[] = [
    {
      label: "Resources",
      items: [
        { label: "Clusters", href: "/dashboard/clusters", icon: <Server className="h-4 w-4" /> },
        { label: "Nodes", href: "/dashboard/nodes", icon: <Server className="h-4 w-4" /> },
        { label: "AppIngress", href: "/dashboard/appingresses", icon: <Globe className="h-4 w-4" /> },
        { label: "Shell", href: "/dashboard/shell", icon: <Terminal className="h-4 w-4" /> },
        { label: "Apply", href: "/dashboard/apply", icon: <FilePlus className="h-4 w-4" /> },
      ],
    },
    {
      label: "Basic",
      items: [
        { label: "Namespaces", href: "/dashboard/namespaces", icon: <Layers className="h-4 w-4" /> },
        { label: "Events", href: "/dashboard/events", icon: <Activity className="h-4 w-4" /> },
      ],
    },
    {
      label: "Workloads",
      items: [
        { label: "Pods", href: "/dashboard/workloads/pods", icon: <Container className="h-4 w-4" /> },
        { label: "Deployments", href: "/dashboard/workloads/deployments", icon: <Container className="h-4 w-4" /> },
        { label: "DaemonSets", href: "/dashboard/workloads/daemonsets", icon: <Boxes className="h-4 w-4" /> },
        { label: "StatefulSets", href: "/dashboard/workloads/statefulsets", icon: <Boxes className="h-4 w-4" /> },
        { label: "ReplicaSets", href: "/dashboard/workloads/replicasets", icon: <Boxes className="h-4 w-4" /> },
        { label: "Jobs", href: "/dashboard/workloads/jobs", icon: <Boxes className="h-4 w-4" /> },
        { label: "CronJobs", href: "/dashboard/workloads/cronjobs", icon: <Boxes className="h-4 w-4" /> },
      ],
    },
    {
      label: "Network",
      items: [
        { label: "Services", href: "/dashboard/services", icon: <Network className="h-4 w-4" /> },
        { label: "EndpointSlices", href: "/dashboard/endpointslices", icon: <Share2 className="h-4 w-4" /> },
      ],
    },
    {
      label: "Storage",
      items: [
        { label: "PersistentVolumes", href: "/dashboard/pv", icon: <HardDrive className="h-4 w-4" /> },
        { label: "PersistentVolumeClaims", href: "/dashboard/pvc", icon: <Database className="h-4 w-4" /> },
      ],
    },
    {
      label: "Config",
      items: [
        { label: "ConfigMaps", href: "/dashboard/configmaps", icon: <FileJson className="h-4 w-4" /> },
        { label: "Secrets", href: "/dashboard/secrets", icon: <Key className="h-4 w-4" /> },
      ],
    },
  ]

  const sidebarContent = (
    <>
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

      {!collapsed && (
        <div className="border-b p-3">
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
                      <SelectItem key={c.metadata.name} value={c.metadata.name} disabled={stopped}>
                        {c.metadata.name}
                        {stopped && <span className="ml-2 text-muted-foreground">(Stopped)</span>}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {activeCluster?.status?.state?.toLowerCase() === "stopped" ? (
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
                  <span className="text-[10px] text-muted-foreground truncate">{clusterDns}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            {!collapsed && (
              <div className="px-2 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
              </div>
            )}
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              const allowedWhenStopped = ["/dashboard/clusters", "/dashboard/nodes", "/dashboard/appingresses"]
              const isDisabled = (item.href === "/appingresses" && !managedIngress) || (isClusterStopped && !allowedWhenStopped.includes(item.href))
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  asChild
                  className={cn(
                    "w-full justify-start gap-2 px-2 text-sm font-normal",
                    collapsed && "justify-center px-0",
                    isActive && "bg-accent font-medium",
                    isDisabled && "opacity-50 pointer-events-none",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Link href={item.href}>
                    {item.icon}
                    {!collapsed && item.label}
                  </Link>
                </Button>
              )
            })}
          </div>
        ))}
      </nav>
    </>
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
          "hidden md:flex h-full flex-col border-r bg-sidebar transition-all duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        {sidebarContent}
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
            <div className="flex-1 overflow-y-auto p-2">
              {groups.map((group) => (
                <div key={group.label} className="mb-2">
                  <div className="px-2 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </span>
                  </div>
                  {group.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                    const allowedWhenStopped = ["/dashboard/clusters", "/dashboard/nodes", "/dashboard/appingresses"]
                    const isDisabled = (item.href === "/appingresses" && !managedIngress) || (isClusterStopped && !allowedWhenStopped.includes(item.href))
                    return (
                      <Button
                        key={item.href}
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        asChild
                        className={cn(
                          "w-full justify-start gap-2 px-2 text-sm font-normal",
                          isActive && "bg-accent font-medium",
                          isDisabled && "opacity-50 pointer-events-none",
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Link href={item.href}>
                          {item.icon}
                          {item.label}
                        </Link>
                      </Button>
                    )
                  })}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
