"use client"

import { useCallback, useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import * as yaml from "js-yaml"
import { getK8sResource, updateK8sResource, type ResourceDescriptor } from "@/lib/api/k8s-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { YamlEditor } from "@/components/yaml/yaml-editor"
import { Loader2, Pencil } from "lucide-react"

function cleanForEdit(obj: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  delete clone.status
  if (clone.metadata && typeof clone.metadata === "object") {
    const meta = clone.metadata as Record<string, unknown>
    const drop = ["uid", "creationTimestamp", "generation", "selfLink", "managedFields", "resourceVersion"]
    for (const key of drop) delete meta[key]
    if (Array.isArray(meta.ownerReferences)) {
      meta.ownerReferences = (meta.ownerReferences as Record<string, unknown>[]).map((o) => {
        const r = { ...o }
        delete r.blockOwnerDeletion
        return r
      })
    }
  }
  return clone
}

export interface ResourceYamlEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clusterDns: string
  desc: ResourceDescriptor
  name: string
  namespace?: string | null
  queryKey: string
  title?: string
}

export function ResourceYamlEditDialog({
  open,
  onOpenChange,
  clusterDns,
  desc,
  name,
  namespace,
  queryKey,
  title,
}: ResourceYamlEditDialogProps) {
  const qc = useQueryClient()
  const [value, setValue] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState("")

  const loadMutation = useMutation({
    mutationFn: async () => {
      const res = await getK8sResource<Record<string, unknown>>(clusterDns, namespace ?? null, desc, name)
      return yaml.dump(cleanForEdit(res), { indent: 2, noRefs: true, lineWidth: -1 })
    },
    onMutate: () => {
      setLoadError("")
      setValue("")
    },
    onSuccess: (text) => {
      setValue(text)
      setParseError(null)
      setLoadError("")
    },
    onError: (err) => setLoadError(err instanceof Error ? err.message : "Failed to load resource"),
  })

  useEffect(() => {
    if (open) {
      loadMutation.mutate()
    }
  }, [open, loadMutation])

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsed = yaml.load(value)
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid YAML: must be a valid object")
      return updateK8sResource(clusterDns, namespace ?? null, desc, name, parsed)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      onOpenChange(false)
    },
    onError: (err) => setParseError(err instanceof Error ? err.message : "Update failed"),
  })

  const handleChange = useCallback((next: string) => {
    setValue(next)
    if (parseError) {
      try {
        const parsed = yaml.load(next)
        if (parsed && typeof parsed === "object") setParseError(null)
      } catch {
        /* keep error */
      }
    }
  }, [parseError])

  const handleSave = () => {
    try {
      const parsed = yaml.load(value)
      if (!parsed || typeof parsed !== "object") {
        setParseError("Invalid YAML: must be a valid object")
        return
      }
    } catch (e) {
      setParseError(`Invalid YAML: ${e instanceof Error ? e.message : "parse error"}`)
      return
    }
    setParseError(null)
    updateMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? `Edit ${desc.resource}`}</DialogTitle>
          <DialogDescription>
            <code className="rounded bg-muted px-1">{name}</code>
            {namespace ? <> in <code className="rounded bg-muted px-1">{namespace}</code></> : null}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{loadError}</div>
        ) : loadMutation.isPending ? (
          <div className="flex h-[28rem] items-center justify-center rounded-md border text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <YamlEditor value={value} onChange={handleChange} height="28rem" />
        )}

        {parseError && <p className="text-sm text-destructive">{parseError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loadMutation.isPending || updateMutation.isPending}>
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EditResourceButton({
  onClick,
}: {
  onClick: () => void
}) {
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" />
    </Button>
  )
}
