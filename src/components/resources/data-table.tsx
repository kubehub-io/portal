"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"

export interface ColumnDef {
  key: string
  label: string
  width?: string
  render?: (value: unknown, item: Record<string, unknown>) => React.ReactNode
}

interface DataTableProps {
  columns: ColumnDef[]
  data: Record<string, unknown>[]
  isLoading?: boolean
  error?: Error | null
  namespace?: string
  onNamespaceChange?: (ns: string) => void
  namespaces?: string[]
  actions?: (item: Record<string, unknown>) => React.ReactNode
  getRowClassName?: (item: Record<string, unknown>) => string | undefined
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-"
  if (Array.isArray(value)) {
    if (value.length === 0) return "-"
    return value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")
  }
  if (typeof value === "object") return JSON.stringify(value)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value)
    const diff = Date.now() - d.getTime()
    const totalSec = Math.max(0, Math.floor(diff / 1000))
    const m = Math.floor(totalSec / 60)
    const h = Math.floor(m / 60)
    const d2 = Math.floor(h / 24)
    const s = totalSec % 60
    if (d2 > 0) return `${d2}d ${h % 24}h`
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s}s`
    return `${totalSec}s`
  }
  return String(value)
}

function renderCell(col: ColumnDef, item: Record<string, unknown>): React.ReactNode {
  if (col.render) {
    return col.render(getNestedValue(item, col.key), item)
  }
  const value = getNestedValue(item, col.key)
  return <span className="text-xs">{formatValue(value)}</span>
}

export function DataTable({
  columns,
  data,
  isLoading,
  error,
  namespace,
  onNamespaceChange,
  namespaces,
  actions,
  getRowClassName,
  currentPage,
  totalPages,
  onPageChange,
}: DataTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {namespaces && onNamespaceChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Namespace:</span>
          <Select value={namespace ?? ""} onValueChange={onNamespaceChange}>
            <SelectTrigger className="h-8 w-48">
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
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} style={{ width: col.width }}>
                  {col.label}
                </TableHead>
              ))}
              {actions && <TableHead className="w-20">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No resources found
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, i) => (
                <TableRow key={(item.metadata as Record<string, unknown>)?.uid as string ?? i} className={getRowClassName?.(item)}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>{renderCell(col, item)}</TableCell>
                  ))}
                  {actions && (
                    <TableCell>{actions(item)}</TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages !== undefined && totalPages > 0 && currentPage !== undefined && onPageChange && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Running" || status === "Active" || status === "Ready" || status === "Succeeded" || status === "True"
      ? "success"
      : status === "Pending" || status === "Unknown"
        ? "warning"
        : status === "Failed" || status === "False" || status === "Error"
          ? "destructive"
          : "secondary"
  return <Badge variant={variant}>{status}</Badge>
}
