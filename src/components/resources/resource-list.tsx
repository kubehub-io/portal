"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  DataTable,
  formatValue,
  getNestedValue,
  type ColumnDef,
  type DataTableProps,
} from "@/components/resources/data-table"
import { ResourceListToolbar } from "@/components/resources/resource-list-toolbar"

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 20, 25, 30]

export type ResourceListProps = Omit<DataTableProps, "data"> & {
  /** The full list of items. Filtering and paging are applied inside this component. */
  data: Record<string, unknown>[]
  /** Page sizes offered in the toolbar. */
  pageSizeOptions?: number[]
  /** Page size selected initially (defaults to the first option). */
  defaultPageSize?: number
  /** Show the page-size picker. Defaults to true. */
  showPageSize?: boolean
  /** Show the free-text filter input. Defaults to true. */
  filterable?: boolean
  filterPlaceholder?: string
  /** Override the default "search every column" text filter. */
  filterFn?: (item: Record<string, unknown>, query: string) => boolean
  /**
   * Extra selectors (for example event reason/type) rendered in the same
   * toolbar row as the namespace picker and text filter.
   */
  filters?: ReactNode
  /** Namespace picker value. Omit for cluster-scoped resource lists. */
  namespace?: string
  onNamespaceChange?: (namespace: string) => void
  /** Namespaces offered by the picker. Omit to hide the picker. */
  namespaces?: string[]
  /**
   * Change this when the list's source changes (resource type, namespace, ...)
   * to reset the current page and clear the filter.
   */
  scopeKey?: string
}

function defaultFilterFn(
  item: Record<string, unknown>,
  query: string,
  columns: ColumnDef[],
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const meta = item.metadata as Record<string, unknown> | undefined
  const values: unknown[] = [meta?.name, meta?.namespace]
  for (const column of columns) {
    values.push(getNestedValue(item, column.key))
  }
  return values.some((value) => formatValue(value).toLowerCase().includes(q))
}

/**
 * Shared list view: a toolbar with filtering, page size, page indicator and
 * page navigation rendered above the table. The whole list is fetched by the
 * caller, then filtered and sliced here so every resource page gets the same
 * behaviour without implementing its own pagination/filtering.
 */
export function ResourceList({
  data,
  columns,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  defaultPageSize,
  showPageSize = true,
  filterable = true,
  filterPlaceholder = "Filter resources...",
  filterFn,
  filters,
  namespace,
  onNamespaceChange,
  namespaces,
  scopeKey,
  emptyMessage,
  ...tableProps
}: ResourceListProps) {
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState(defaultPageSize ?? pageSizeOptions[0] ?? 10)
  const [page, setPage] = useState(1)

  // Reset page and filter when the list's scope changes (e.g. the user picks a
  // different resource type or namespace). This follows the same render-time
  // state adjustment pattern already used by the custom resources page.
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey)
  if (scopeKey !== lastScopeKey) {
    setLastScopeKey(scopeKey)
    setPage(1)
    setQuery("")
  }

  const filtered = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return data
    if (filterFn) return data.filter((item) => filterFn(item, trimmed))
    return data.filter((item) => defaultFilterFn(item, trimmed, columns))
  }, [data, query, columns, filterFn])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const resolvedEmptyMessage =
    query.trim() && filtered.length === 0
      ? "No resources match your filter"
      : emptyMessage

  return (
    <div className="space-y-4">
      <ResourceListToolbar
        filters={filters}
        filterable={filterable}
        query={query}
        onQueryChange={(value) => {
          setQuery(value)
          setPage(1)
        }}
        filterPlaceholder={filterPlaceholder}
        count={filtered.length}
        namespace={namespace}
        onNamespaceChange={onNamespaceChange}
        namespaces={namespaces}
        showPageSize={showPageSize}
        pageSize={pageSize}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
        currentPage={currentPage}
        totalPages={totalPages}
        onPreviousPage={() => setPage(currentPage - 1)}
        onNextPage={() => setPage(currentPage + 1)}
      />

      <DataTable
        {...tableProps}
        columns={columns}
        data={pageItems}
        emptyMessage={resolvedEmptyMessage}
      />
    </div>
  )
}
