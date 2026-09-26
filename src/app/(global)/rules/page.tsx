"use client"

import { Suspense, useCallback, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useRuleNamespaces, useSaveRules } from "@/hooks/use-monitoring"
import { RulesEditor } from "@/components/monitoring/rules-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { isValidNamespace, namespaceSummary } from "@/lib/monitoring/rules"
import { ChevronRight, Loader2, Pencil, Plus } from "lucide-react"

function rulesHref(namespace: string): string {
  return `/rules?namespace=${encodeURIComponent(namespace)}`
}

function NamespaceList({ onSelect }: { onSelect: (namespace: string) => void }) {
  const query = useRuleNamespaces()
  const save = useSaveRules()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [createError, setCreateError] = useState("")

  const handleCreate = useCallback(() => {
    const namespace = name.trim()
    if (!isValidNamespace(namespace)) {
      setCreateError("Use lowercase letters, digits, - and . (max 253 characters)")
      return
    }
    setCreateError("")
    setCreateOpen(false)
    setName("")
    save.mutate(
      { namespace, rules: { name: namespace, groups: [] } },
      { onSuccess: () => onSelect(namespace) },
    )
  }, [name, save, onSelect])

  const namespaces = query.data?.data ?? []

  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
        Failed to load rule namespaces: {query.error.message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">Monitoring rule namespaces for this account</p>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => {
            setName("")
            setCreateError("")
            setCreateOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New namespace
        </Button>
      </div>

      <div className="rounded-md border">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Groups</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Alerting rules</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {namespaces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No rule namespaces yet
                  </TableCell>
                </TableRow>
              ) : (
                namespaces.map((entry) => {
                  const summary = namespaceSummary(entry)
                  return (
                    <TableRow key={entry.namespace}>
                      <TableCell className="font-medium">{entry.namespace}</TableCell>
                      <TableCell>{summary.groups}</TableCell>
                      <TableCell>{summary.rules}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {summary.alerts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Recording rules only</span>
                          ) : (
                            summary.alerts.map((alert) => (
                              <Badge key={alert} variant="secondary">
                                {alert}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link href={rulesHref(entry.namespace)} title={`Edit ${entry.namespace}`}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New rule namespace</DialogTitle>
            <DialogDescription>
              Creates an empty namespace you can then fill with rule groups.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="namespace" className="text-xs text-muted-foreground">
              Namespace
            </Label>
            <Input
              id="namespace"
              value={name}
              placeholder="platform"
              onChange={(e) => setName(e.target.value)}
            />
            {createError && <p className="text-xs text-destructive">{createError}</p>}
          </div>
          {save.isError && (
            <p className="text-sm text-destructive">
              {save.error instanceof Error ? save.error.message : "Create failed"}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RulesPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const namespace = searchParams.get("namespace")

  if (namespace) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/rules" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Alert rules
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{namespace}</h2>
            <Badge variant="secondary">
              <Pencil className="h-3 w-3" />
              editing
            </Badge>
          </div>
          <p className="text-muted-foreground">Rule groups evaluated for this namespace</p>
        </div>
        <RulesEditor
          namespace={namespace}
          onDeleted={() => {
            router.push("/rules")
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Alert rules</h2>
        <p className="text-muted-foreground">Recording and alerting rules evaluated by the monitoring underlays</p>
      </div>
      <NamespaceList onSelect={(ns) => router.push(rulesHref(ns))} />
    </div>
  )
}

export default function RulesPage() {
  return (
    <Suspense fallback={null}>
      <RulesPageContent />
    </Suspense>
  )
}
