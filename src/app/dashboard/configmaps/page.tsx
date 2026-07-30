"use client"

import { DataTable } from "@/components/resources/data-table"
import { useK8sClusterResources } from "@/hooks/use-k8s-resources"
import { useClusterStore } from "@/stores/cluster-store"
import { useState, useCallback } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateK8sResource } from "@/lib/api/k8s-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Pencil, Loader2 } from "lucide-react"
import * as yaml from "js-yaml"

export default function ConfigMapsPage() {
  const qc = useQueryClient()
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const clusterDns = activeCluster?.status.publicDns
  const [namespace, setNamespace] = useState("__all")
  const { data: nsData } = useK8sClusterResources({ version: "v1", resource: "namespaces" }, "namespaces")
  const { data, isLoading, error } = useK8sClusterResources({ version: "v1", resource: "configmaps" }, "configmaps")
  const namespaces = (nsData?.items ?? []).map((ns: { metadata: { name: string } }) => ns.metadata.name).sort()
  let items = (data?.items ?? []) as unknown as Record<string, unknown>[]
  if (namespace && namespace !== "__all") {
    items = items.filter((i) => (i.metadata as Record<string, unknown>)?.namespace === namespace)
  }

  const [editTarget, setEditTarget] = useState<Record<string, unknown> | null>(null)
  const [yamlValue, setYamlValue] = useState("")
  const [yamlError, setYamlError] = useState("")

  const openEditor = useCallback((item: Record<string, unknown>) => {
    const cleaned = JSON.parse(JSON.stringify(item))
    if (cleaned.metadata) {
      const keep = new Set(["name", "namespace", "labels", "annotations", "resourceVersion"])
      for (const key of Object.keys(cleaned.metadata)) {
        if (!keep.has(key)) delete cleaned.metadata[key]
      }
    }
    setEditTarget(item)
    setYamlValue(yaml.dump(cleaned, { indent: 2, noRefs: true }))
    setYamlError("")
  }, [])

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget || !clusterDns) throw new Error("No target or cluster")
      const meta = editTarget.metadata as Record<string, string>
      const namespace = meta.namespace || null
      const name = meta.name
      const parsed = yaml.load(yamlValue) as Record<string, unknown>
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid YAML")
      return updateK8sResource(clusterDns, namespace, { version: "v1", resource: "configmaps" }, name, parsed)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["configmaps"] })
      setEditTarget(null)
    },
    onError: (err) => {
      setYamlError(err instanceof Error ? err.message : "Update failed")
    },
  })

  const handleSave = () => {
    setYamlError("")
    try {
      const parsed = yaml.load(yamlValue)
      if (!parsed || typeof parsed !== "object") {
        setYamlError("Invalid YAML: must be a valid object")
        return
      }
    } catch (e) {
      setYamlError(`Invalid YAML: ${e instanceof Error ? e.message : "parse error"}`)
      return
    }
    updateMutation.mutate()
  }

  const columns = [
    { key: "metadata.name", label: "Name" },
    { key: "metadata.namespace", label: "Namespace" },
    {
      key: "data",
      label: "Data Keys",
      render: (v: unknown) => {
        const data = v as Record<string, string> | undefined
        return <span className="text-xs">{data ? Object.keys(data).join(", ") : "-"}</span>
      },
    },
    { key: "metadata.creationTimestamp", label: "Age" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">ConfigMaps</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / configmaps` : "No active cluster"}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        error={error}
        namespace={namespace}
        onNamespaceChange={setNamespace}
        namespaces={namespaces}
        actions={(item) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => openEditor(item)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      />

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) { setEditTarget(null); setYamlError("") } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit ConfigMap</DialogTitle>
            <DialogDescription>
              {(editTarget?.metadata as Record<string, string>)?.name ?? ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              className="w-full h-96 rounded-md border bg-muted p-4 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={yamlValue}
              onChange={(e) => setYamlValue(e.target.value)}
            />
            {yamlError && (
              <p className="text-sm text-destructive">{yamlError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTarget(null); setYamlError("") }}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
