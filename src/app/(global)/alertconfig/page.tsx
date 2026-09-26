"use client"

import Link from "next/link"
import { useAlertmanagerConfig } from "@/hooks/use-monitoring"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { listAlertmanagerConfigNames, type AlertmanagerConfigName } from "@/lib/api/monitoring"
import { receiverTypeLabel, receiverTypes } from "@/lib/monitoring/alertmanager"
import { ChevronRight, Loader2 } from "lucide-react"

function ConfigRow({ name }: { name: AlertmanagerConfigName }) {
  const query = useAlertmanagerConfig(name)
  const receivers = query.data?.data.receivers ?? []
  const types = Array.from(new Set(receivers.flatMap((r) => receiverTypes(r))))

  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell className="text-muted-foreground">Default configuration</TableCell>
      <TableCell>
        {query.isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : query.isError ? (
          <span className="text-xs text-destructive">{query.error.message}</span>
        ) : receivers.length === 0 ? (
          <span className="text-xs text-muted-foreground">No receivers</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {receivers.map((receiver, i) => (
              <Badge key={i} variant="secondary">
                {receiver.name?.trim() || `receiver-${i + 1}`}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell>
        {query.isLoading || query.isError ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : types.length === 0 ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {types.map((type) => (
              <Badge key={type} variant="info">
                {receiverTypeLabel(type)}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="w-16 text-right">
        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
          <Link href={`/alertconfig/${name}`} title={`Open ${name}`}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}

export default function AlertConfigListPage() {
  const names = listAlertmanagerConfigNames()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notification settings</h2>
        <p className="text-muted-foreground">Alertmanager configurations available to this account</p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Receivers</TableHead>
              <TableHead>Types</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {names.map((name) => (
              <ConfigRow key={name} name={name} />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        The monitoring API models configurations as a collection but only exposes the well-known{" "}
        <code className="rounded bg-muted px-1">default</code> configuration.
      </p>
    </div>
  )
}
