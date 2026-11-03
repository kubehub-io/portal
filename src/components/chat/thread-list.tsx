"use client"

import { Loader2, MessageSquare, Plus, RefreshCw } from "lucide-react"
import type { ChatThread } from "@/lib/api/agent-chat"
import { formatRelativeTime, threadTitle } from "@/lib/chat"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ChatThreadListProps {
  threads: ChatThread[]
  selectedID: string | null
  onSelect: (threadID: string) => void
  onNew: () => void
  canCreate?: boolean
  isLoading: boolean
  isError: boolean
  errorMessage?: string
  onRetry?: () => void
  now: number
}

export function ChatThreadList({
  threads,
  selectedID,
  onSelect,
  onNew,
  canCreate = true,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  now,
}: ChatThreadListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Conversations
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onNew}
          disabled={!canCreate}
          title={canCreate ? "New chat" : "Select a cluster to start a new chat"}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">New chat</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : isError && threads.length === 0 ? (
          <div className="space-y-2 p-2 text-xs text-destructive">
            <p>{errorMessage || "Failed to load conversations"}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No conversations yet.
            <br />
            Start a new chat below.
          </div>
        ) : (
          <div className="space-y-1">
            {threads.map((thread) => {
              const active = thread.id === selectedID
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    active && "bg-accent",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MessageSquare
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate text-sm font-medium">{threadTitle(thread)}</span>
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2 pl-5 text-[11px] text-muted-foreground">
                    <span className="truncate">{thread.cluster_id ?? "Agent chat"}</span>
                    <span className="shrink-0">{formatRelativeTime(thread.updated_at, now)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
