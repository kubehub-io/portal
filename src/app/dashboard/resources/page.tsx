"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useAPIDiscovery } from "@/hooks/use-api-discovery"
import { useClusterStore } from "@/stores/cluster-store"
import { DataTable, type ColumnDef } from "@/components/resources/data-table"
import { ResourceTypeStar } from "@/components/resources/resource-type-star"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Boxes, ExternalLink, Star } from "lucide-react"
import {
  buildResourceTypes,
  matchesResourceTypeQuery,
  resourceTypeGroupLabel,
  type ResourceTypeEntry,
} from "@/lib/resource-types"
import { getNavItemForPlural, resourceTypeHref } from "@/lib/navigation"

const PAGE_SIZE = 25
const ALL_GROUPS = "__all"

function AllResourcesContent() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const { data: discovery, isLoading, error } = useAPIDiscovery()

  const [search, setSearch] = useState("")
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS)
  const [currentPage, setCurrentPage] = useState(1)
  const [scope, setScope] = useState({ search: "", groupFilter })
  if (scope.search !== search || scope.groupFilter !== groupFilter) {
    setScope({ search, groupFilter })
    setCurrentPage(1)
  }

  const allTypes = useMemo(() => buildResourceTypes(discovery), [discovery])

  const groups = useMemo(
    () => [...new Set(allTypes.map((t) => t.group))].sort((a, b) => a.localeCompare(b)),
    [allTypes],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allTypes.filter(
      (t) =>
        (groupFilter === ALL_GROUPS || t.group === groupFilter) &&
        matchesResourceTypeQuery(t, q),
    )
  }, [allTypes, search, groupFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const columns: ColumnDef[] = useMemo(
    () => [
      {
        key: "kind",
        label: "Type",
        render: (value, item) => (
          <span className="flex items-center gap-2 text-sm font-medium">
            <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
            {String(value)}
            {getNavItemForPlural(String(item.plural)) && (
              <Badge variant="secondary" className="text-[10px]">
                Page
              </Badge>
            )}
          </span>
        ),
      },
      {
        key: "group",
        label: "API Group",
        render: (value) => (
          <span className="text-xs text-muted-foreground">
            {resourceTypeGroupLabel(String(value))}
          </span>
        ),
      },
      {
        key: "version",
        label: "Version",
        render: (value) => <span className="text-xs text-muted-foreground">{String(value)}</span>,
      },
      {
        key: "plural",
        label: "Resource",
        render: (value) => (
          <span className="font-mono text-xs text-muted-foreground">{String(value)}</span>
        ),
      },
      {
        key: "namespaced",
        label: "Scope",
        render: (value) => (
          <Badge variant={value ? "secondary" : "outline"} className="text-[10px]">
            {value ? "Namespaced" : "Cluster"}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">All Resources</h2>
        <p className="text-muted-foreground">
          {activeCluster
            ? `Every resource type served by ${activeCluster.metadata.name}`
            : "No active cluster"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by kind, group or resource..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 max-w-xs"
        />
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="h-8 w-56">
            <SelectValue placeholder="All API groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>All API groups</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group} value={group}>
                {resourceTypeGroupLabel(group)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} resource type{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
          Failed to discover cluster APIs: {error.message}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={paginated as unknown as Record<string, unknown>[]}
          isLoading={isLoading}
          emptyMessage="No resource types match your search"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          actions={(item) => (
            <ResourceRowActions entry={item as unknown as ResourceTypeEntry} />
          )}
        />
      )}
    </div>
  )
}

function ResourceRowActions({ entry }: { entry: ResourceTypeEntry }) {
  const curated = getNavItemForPlural(entry.plural)
  const href = curated ? curated.href : resourceTypeHref(entry)
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
        <Link href={href}>
          {curated ? <Star className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
          {curated ? curated.label : "View"}
        </Link>
      </Button>
      {!curated && <ResourceTypeStar entry={entry} />}
    </div>
  )
}

export default function AllResourcesPage() {
  return (
    <Suspense fallback={null}>
      <AllResourcesContent />
    </Suspense>
  )
}