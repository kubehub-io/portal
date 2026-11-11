"use client"

import type { ReactNode } from "react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { BookOpen, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

const DEFAULT_DOCS_URL = "https://docs.kubehub.io"

interface ResourcePageHeaderProps {
  title: string
  subtitle: ReactNode
  docsHref?: string
  actions?: ReactNode
}

export function ResourcePageHeader({
  title,
  subtitle,
  docsHref = DEFAULT_DOCS_URL,
  actions,
}: ResourcePageHeaderProps) {
  const queryClient = useQueryClient()
  const isFetching = useIsFetching() > 0

  async function refresh() {
    await queryClient.refetchQueries({ type: "active" })
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Refresh"
          title="Refresh"
          onClick={() => void refresh()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "animate-spin" : ""} />
        </Button>
        {actions}
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
        >
          <BookOpen className="h-4 w-4" />
          Docs
        </a>
      </div>
    </div>
  )
}
