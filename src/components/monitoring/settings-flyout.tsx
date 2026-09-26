"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BellRing, ChevronRight, Settings, Siren } from "lucide-react"

export const ALERT_RULES_PATH = "/rules"
export const NOTIFICATION_SETTINGS_PATH = "/alertconfig/default"
export const NOTIFICATION_SETTINGS_LIST_PATH = "/alertconfig"

interface FlyoutItem {
  label: string
  description: string
  href: string
  icon: React.ReactNode
}

const items: FlyoutItem[] = [
  {
    label: "Notification settings",
    description: "Routing and receivers for firing alerts",
    href: NOTIFICATION_SETTINGS_PATH,
    icon: <BellRing className="h-4 w-4" />,
  },
  {
    label: "Alert rules",
    description: "Recording and alerting rule groups",
    href: ALERT_RULES_PATH,
    icon: <Siren className="h-4 w-4" />,
  },
]

export function SettingsFlyout() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="Settings" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="px-3 py-2">
          <p className="text-sm font-semibold">Settings</p>
          <p className="text-xs text-muted-foreground">Alerting configuration</p>
        </div>
        <div className="border-t p-1">
          {items.map((item) => (
            <button
              key={item.href}
              type="button"
              className="flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false)
                router.push(item.href)
              }}
            >
              <span className="mt-0.5 text-muted-foreground">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
