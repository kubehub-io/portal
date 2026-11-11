"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useClusters } from "@/hooks/use-clusters"
import { Server, Activity, HardDrive, Container, Boxes } from "lucide-react"
import Link from "next/link"
import { CUSTOM_RESOURCES_PATH } from "@/lib/navigation"

export default function DashboardPage() {
  const { clusters, activeCluster } = useClusters()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground">
          {activeCluster
            ? `Active cluster: ${activeCluster.metadata.name}`
            : "No active cluster"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clusters</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clusters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cluster</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCluster?.metadata.name ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">{activeCluster?.status.publicDns}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Region</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCluster?.spec.region ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resources</CardTitle>
            <Container className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              Pin any resource type — native or CRD — from Customize tabs, or open the generic viewer.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={CUSTOM_RESOURCES_PATH}>
                <Boxes className="mr-2 h-4 w-4" />
                Browse Resources
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
