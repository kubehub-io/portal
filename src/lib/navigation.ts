import {
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
  Globe,
  Terminal,
  FilePlus,
  ListTree,
  type LucideIcon,
} from "lucide-react"
import { resourceTypeKey } from "@/lib/resource-types"

/**
 * A resource tab that can be favorited, hidden, or gated by a cluster capability.
 * `id` is the stable identity used by user preferences — never derive it from the label.
 */
export interface NavItem {
  id: string
  label: string
  href: string
  description?: string
  icon: LucideIcon
  /** Cluster feature that must be enabled for this tab to be usable. */
  requires?: NavCapability
  /** Stays reachable even when the cluster is stopped. */
  availableWhenStopped?: boolean
  /** API plural this page lists, used to link from the All Resources catalog. */
  k8sPlural?: string
}

export type NavCapability = "managedIngress"

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export const ALL_RESOURCES_PATH = "/dashboard/resources"
export const CUSTOM_RESOURCES_PATH = "/dashboard/custom-resources"
export const CUSTOM_RESOURCES_TYPE_PARAM = "type"

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "resources",
    label: "Resources",
    items: [
      {
        id: "all-resources",
        label: "All Resources",
        href: ALL_RESOURCES_PATH,
        description: "Every resource type served by the cluster",
        icon: ListTree,
        availableWhenStopped: true,
      },
      {
        id: "clusters",
        label: "Clusters",
        href: "/dashboard/clusters",
        icon: Server,
        availableWhenStopped: true,
      },
      {
        id: "nodes",
        label: "Nodes",
        href: "/dashboard/nodes",
        icon: Server,
        availableWhenStopped: true,
        k8sPlural: "nodes",
      },
      {
        id: "appingresses",
        label: "AppIngress",
        href: "/dashboard/appingresses",
        description: "Managed ingresses exposed through the cluster load balancer",
        icon: Globe,
        requires: "managedIngress",
        availableWhenStopped: true,
      },
      {
        id: "shell",
        label: "Shell",
        href: "/dashboard/shell",
        icon: Terminal,
      },
      {
        id: "apply",
        label: "Apply",
        href: "/dashboard/apply",
        icon: FilePlus,
      },
      {
        id: "custom-resources",
        label: "Custom Resources",
        href: CUSTOM_RESOURCES_PATH,
        description: "Browse any resource type through the generic viewer",
        icon: Boxes,
      },
    ],
  },
  {
    id: "basic",
    label: "Basic",
    items: [
      { id: "namespaces", label: "Namespaces", href: "/dashboard/namespaces", icon: Layers, k8sPlural: "namespaces" },
      { id: "events", label: "Events", href: "/dashboard/events", icon: Activity, k8sPlural: "events" },
    ],
  },
  {
    id: "workloads",
    label: "Workloads",
    items: [
      { id: "pods", label: "Pods", href: "/dashboard/workloads/pods", icon: Container, k8sPlural: "pods" },
      { id: "deployments", label: "Deployments", href: "/dashboard/workloads/deployments", icon: Container, k8sPlural: "deployments" },
      { id: "daemonsets", label: "DaemonSets", href: "/dashboard/workloads/daemonsets", icon: Boxes, k8sPlural: "daemonsets" },
      { id: "statefulsets", label: "StatefulSets", href: "/dashboard/workloads/statefulsets", icon: Boxes, k8sPlural: "statefulsets" },
      { id: "replicasets", label: "ReplicaSets", href: "/dashboard/workloads/replicasets", icon: Boxes, k8sPlural: "replicasets" },
      { id: "jobs", label: "Jobs", href: "/dashboard/workloads/jobs", icon: Boxes, k8sPlural: "jobs" },
      { id: "cronjobs", label: "CronJobs", href: "/dashboard/workloads/cronjobs", icon: Boxes, k8sPlural: "cronjobs" },
    ],
  },
  {
    id: "network",
    label: "Network",
    items: [
      { id: "services", label: "Services", href: "/dashboard/services", icon: Network, k8sPlural: "services" },
      { id: "endpointslices", label: "EndpointSlices", href: "/dashboard/endpointslices", icon: Share2, k8sPlural: "endpointslices" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    items: [
      { id: "persistentvolumes", label: "PersistentVolumes", href: "/dashboard/pv", icon: HardDrive, k8sPlural: "persistentvolumes" },
      { id: "persistentvolumeclaims", label: "PersistentVolumeClaims", href: "/dashboard/pvc", icon: Database, k8sPlural: "persistentvolumeclaims" },
    ],
  },
  {
    id: "config",
    label: "Config",
    items: [
      { id: "configmaps", label: "ConfigMaps", href: "/dashboard/configmaps", icon: FileJson, k8sPlural: "configmaps" },
      { id: "secrets", label: "Secrets", href: "/dashboard/secrets", icon: Key, k8sPlural: "secrets" },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function getNavItem(id: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.id === id)
}

/** Curated page that already lists `plural`, if the portal has one. */
export function getNavItemForPlural(plural: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.k8sPlural === plural)
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(item.href + "/")
}

/**
 * Identifies a resource type served by the cluster. Custom resource definitions
 * have no curated page, so they are favorited by identity and rendered through
 * the generic viewer.
 */
export function resourceTypeNavId(key: string): string {
  return `crd:${key}`
}

export function resourceTypeHref(entry: { group: string; version: string; kind: string }): string {
  const params = new URLSearchParams()
  params.set(CUSTOM_RESOURCES_TYPE_PARAM, resourceTypeKey(entry.group, entry.version, entry.kind))
  return `${CUSTOM_RESOURCES_PATH}?${params.toString()}`
}