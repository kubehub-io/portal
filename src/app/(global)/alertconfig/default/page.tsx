"use client"

import Link from "next/link"
import { NotificationSettingsForm } from "@/components/monitoring/notification-settings-form"
import { DEFAULT_ALERTMANAGER_CONFIG } from "@/lib/api/monitoring"
import { ChevronLeft } from "lucide-react"

export default function AlertConfigDetailPage() {
  const name = DEFAULT_ALERTMANAGER_CONFIG

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/alertconfig"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Notification settings
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
        <p className="text-muted-foreground">Routing and receivers for firing alerts</p>
      </div>

      <NotificationSettingsForm name={name} />
    </div>
  )
}
