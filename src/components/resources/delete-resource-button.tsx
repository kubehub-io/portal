"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, AlertTriangle } from "lucide-react"
import { deleteK8sResource, type ResourceDescriptor } from "@/lib/api/k8s-client"
import type { Cluster } from "@/stores/cluster-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

export interface DeleteResourceButtonProps {
  cluster: Cluster | null
  desc: ResourceDescriptor
  name: string
  namespace?: string | null
  /** Human-readable kind, used in the confirmation copy. */
  kind: string
  /** Query key prefix of the list this resource came from. */
  queryKey: string
}

export function DeleteResourceButton({
  cluster,
  desc,
  name,
  namespace,
  kind,
  queryKey,
}: DeleteResourceButtonProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const deleteMutation = useMutation({
    mutationFn: () => deleteK8sResource(cluster!, namespace ?? null, desc, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] })
      setOpen(false)
    },
  })

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label={`Delete ${kind} ${name}`}
        title={`Delete ${kind}`}
        onClick={() => {
          setDeleteError("")
          setOpen(true)
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setDeleteError("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete {kind}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {kind.toLowerCase()}{" "}
              <strong>{name}</strong>
              {namespace ? (
                <>
                  {" "}
                  in namespace <strong>{namespace}</strong>
                </>
              ) : null}
              ? This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || !cluster}
              onClick={() => {
                setDeleteError("")
                deleteMutation
                  .mutateAsync()
                  .catch((e: unknown) =>
                    setDeleteError(e instanceof Error ? e.message : `Failed to delete ${kind.toLowerCase()}`),
                  )
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
