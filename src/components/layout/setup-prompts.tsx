"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Boxes, Bot, ExternalLink, FilePlus, MessageSquare, Server, Terminal, X } from "lucide-react"
import { useClusters } from "@/hooks/use-clusters"
import { listControlPlaneNodes } from "@/lib/api/control-plane"
import { useWorkbenchStore } from "@/stores/workbench-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const DISMISSED_KEY = "kubehub:setup-prompts:dismissed"
type PromptId = "cluster" | "node" | "explore"

function loadDismissed(): Partial<Record<PromptId, boolean>> {
  try {
    return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? "{}") as Partial<Record<PromptId, boolean>>
  } catch {
    return {}
  }
}

export function SetupPrompts() {
  const { clusters, activeCluster, isLoading: clustersLoading } = useClusters()
  const [dismissed, setDismissed] = useState<Partial<Record<PromptId, boolean>>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDismissed(loadDismissed())
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const nodesQuery = useQuery({
    queryKey: ["setup-prompt-nodes", activeCluster?.metadata.name],
    queryFn: () => listControlPlaneNodes(activeCluster!.metadata.name),
    enabled: hydrated && !!activeCluster,
    retry: false,
    refetchInterval: 10_000,
  })

  if (!hydrated || clustersLoading) return null

  const dismiss = (id: PromptId) => {
    const next = { ...dismissed, [id]: true }
    setDismissed(next)
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  }

  const prompt: PromptId | null =
    clusters.length === 0 && !dismissed.cluster
      ? "cluster"
      : activeCluster && nodesQuery.isSuccess && nodesQuery.data.length === 0 && !dismissed.node
        ? "node"
        : activeCluster && nodesQuery.isSuccess && nodesQuery.data.length > 0 && !dismissed.explore
          ? "explore"
          : null

  if (!prompt) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-14 z-30 flex justify-end md:inset-x-auto md:right-6 md:w-[min(32rem,calc(100vw-3rem))]">
      <Card className="pointer-events-auto w-full border-primary/30 shadow-lg">
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              {prompt === "cluster" ? <Server className="h-5 w-5" /> : prompt === "node" ? <Bot className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-base">
                {prompt === "cluster" ? "Start by creating a cluster" : prompt === "node" ? "Add your first node" : "Your cluster is ready"}
              </CardTitle>
              <CardDescription className="mt-1">
                {prompt === "cluster"
                  ? "Create a cluster to get a managed control plane ready for your Linux node."
                  : prompt === "node"
                    ? "Open Nodes, then click Add Node to get the onboarding command for your amd64 or arm64 Linux machine."
                    : "Explore your resources, then use the Workbench to apply YAML, open a shell, or ask Chat for help."}
              </CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-2" aria-label="Dismiss" onClick={() => dismiss(prompt)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="pt-0">
          {prompt === "cluster" && (
            <div className="flex justify-end">
              <Button asChild onClick={() => dismiss("cluster")}>
                <Link href="/dashboard/clusters">Create Cluster <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          )}

          {prompt === "node" && (
            <div className="flex justify-end">
              <Button asChild onClick={() => dismiss("node")}>
                <Link href="/dashboard/nodes">Go to Nodes <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          )}

          {prompt === "explore" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <ResourceLink href="/dashboard/namespaces" label="Namespaces" />
                <ResourceLink href="/dashboard/workloads/pods" label="Pods" />
                <ResourceLink href="/dashboard/workloads/deployments" label="Deployments" />
                <ResourceLink href="/dashboard/custom-resources" label="Custom Resources" />
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <WorkbenchButton panel="apply" label="Apply" icon={<FilePlus className="h-3.5 w-3.5" />} />
                <WorkbenchButton panel="shell" label="Shell" icon={<Terminal className="h-3.5 w-3.5" />} />
                <WorkbenchButton panel="chat" label="Chat" icon={<MessageSquare className="h-3.5 w-3.5" />} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ResourceLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{label} <ExternalLink className="h-3 w-3" /></Link>
    </Button>
  )
}

function WorkbenchButton({ panel, label, icon }: { panel: "apply" | "shell" | "chat"; label: string; icon: React.ReactNode }) {
  const toggle = useWorkbenchStore((state) => state.toggle)
  return <Button variant="secondary" size="sm" onClick={() => toggle(panel)}>{icon}{label}</Button>
}
