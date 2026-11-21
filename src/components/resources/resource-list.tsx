"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DataTable,
  formatValue,
  getNestedValue,
  type ColumnDef,
  type DataTableProps,
} from "@/components/resources/data-table"

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 20, 25, 30]

export type ResourceListProps = Omit<
  DataTableProps,
  "data" | "currentPage" | "totalPages" | "onPageChange"
> & {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {filterable && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder={filterPlaceholder}
                aria-label="Filter resources"
                className="h-8 w-56 pl-8 pr-8"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => {
                    setQuery("")
                    setPage(1)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <span className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showPageSize && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8 w-16" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <span className="text-sm tabular-nums text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        {...tableProps}
        columns={columns}
        data={pageItems}
        emptyMessage={resolvedEmptyMessage}
      />
    </div>
  )
}
