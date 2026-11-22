"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Bot, Server } from "lucide-react"
import { useClusters } from "@/hooks/use-clusters"
import { listControlPlaneNodes } from "@/lib/api/control-plane"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PromptId = "cluster" | "node"

export function SetupPrompts() {
  const { clusters, activeCluster, isLoading: clustersLoading } = useClusters()

  const nodesQuery = useQuery({
    queryKey: ["setup-prompt-nodes", activeCluster?.metadata.name],
    queryFn: () => listControlPlaneNodes(activeCluster!.metadata.name),
    enabled: !!activeCluster,
    retry: false,
    refetchInterval: 10_000,
  })

  if (clustersLoading) return null

  const prompt: PromptId | null =
    clusters.length === 0
      ? "cluster"
      : activeCluster && nodesQuery.isSuccess && nodesQuery.data.length === 0
        ? "node"
        : null

  if (!prompt) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-14 z-30 flex justify-end md:inset-x-auto md:right-6 md:w-[min(32rem,calc(100vw-3rem))]">
      <Card className="pointer-events-auto w-full border-primary/30 shadow-lg">
        <CardHeader className="flex-row items-start space-y-0 pb-3">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              {prompt === "cluster" ? <Server className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-base">
                {prompt === "cluster" ? "Start by creating a cluster" : "Add your first node"}
              </CardTitle>
              <CardDescription className="mt-1">
                {prompt === "cluster"
                  ? "Create a cluster to get a managed control plane ready for your Linux node."
                  : "Open Nodes, then click Add Node to get the onboarding command for your amd64 or arm64 Linux machine."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex justify-end">
            <Button asChild>
              {prompt === "cluster" ? (
                <Link href="/dashboard/clusters?create=1">Create Cluster <ArrowRight className="h-4 w-4" /></Link>
              ) : (
                <Link href="/dashboard/nodes?addNode=1">Add Node <ArrowRight className="h-4 w-4" /></Link>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
