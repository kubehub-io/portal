"use client"

import type { ReactNode } from "react"
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
import { cn } from "@/lib/utils"

export interface NamespacePickerProps {
  /** Currently selected namespace. "__all" (or empty) shows all namespaces. */
  value?: string
  onChange: (namespace: string) => void
  /** Namespaces offered in the picker. */
  namespaces: string[]
  className?: string
  /** Optional inline label. Pass null to render just the select. */
  label?: string | null
}

/**
 * Shared namespace selector. Namespaced list pages render this inside their
 * toolbar; cluster-scoped pages simply omit it.
 */
export function NamespacePicker({
  value,
  onChange,
  namespaces,
  className,
  label = "Namespace:",
}: NamespacePickerProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <Select value={value || "__all"} onValueChange={onChange}>
        <SelectTrigger className={cn("h-8 w-48", className)} aria-label="Namespace">
          <SelectValue placeholder="All namespaces" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All namespaces</SelectItem>
          {namespaces.map((ns) => (
            <SelectItem key={ns} value={ns}>
              {ns}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export interface ResourceListToolbarProps {
  /** Extra selectors (for example event reason/type) rendered in the same row. */
  filters?: ReactNode
  filterable: boolean
  query: string
  onQueryChange: (value: string) => void
  filterPlaceholder: string
  count: number
  namespace?: string
  onNamespaceChange?: (namespace: string) => void
  namespaces?: string[]
  showPageSize: boolean
  pageSize: number
  pageSizeOptions: number[]
  onPageSizeChange: (pageSize: number) => void
  currentPage: number
  totalPages: number
  onPreviousPage: () => void
  onNextPage: () => void
}

/**
 * Single toolbar row shared by every resource list. Namespace picker and any
 * page-specific filters come first, followed by the text filter and item count,
 * with the page controls pushed to the right.
 */
export function ResourceListToolbar({
  filters,
  filterable,
  query,
  onQueryChange,
  filterPlaceholder,
  count,
  namespace,
  onNamespaceChange,
  namespaces,
  showPageSize,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPreviousPage,
  onNextPage,
}: ResourceListToolbarProps) {
  const showNamespacePicker = Boolean(namespaces && onNamespaceChange)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {showNamespacePicker && (
        <NamespacePicker
          value={namespace}
          onChange={onNamespaceChange!}
          namespaces={namespaces!}
        />
      )}
      {filters}
      {filterable && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={filterPlaceholder}
            aria-label="Filter resources"
            className="h-8 w-56 pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      <span className="text-sm text-muted-foreground">
        {count} {count === 1 ? "item" : "items"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {showPageSize && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
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
            onClick={onPreviousPage}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage >= totalPages}
            onClick={onNextPage}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
