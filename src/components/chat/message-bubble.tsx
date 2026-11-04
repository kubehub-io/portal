"use client"

import { Bot, Check, CircleAlert, Loader2, Wrench } from "lucide-react"
import type { ChatMessage } from "@/lib/api/agent-chat"
import type { ChatProgressItem } from "@/hooks/use-agent-chat"
import { isProgressRunning, progressLabel } from "@/lib/chat"
import { AgentMarkdown } from "@/components/chat/agent-markdown"
import { cn } from "@/lib/utils"

function AgentAvatar() {
  return (
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Bot className="h-4 w-4" />
    </div>
  )
}

function ProgressTimeline({ items }: { items: ChatProgressItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-3 rounded-lg border bg-muted/30 p-2.5 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5 font-medium text-muted-foreground">
        <Wrench className="h-3 w-3" />
        Agent activity
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const running = isProgressRunning(item)
          return (
            <div key={item.id} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                {running ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-muted-foreground">{progressLabel(item)}</div>
                {typeof item.detail === "string" && item.detail && (
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
                    {item.detail}
                  </pre>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <AgentMarkdown content={message.content} />
      </div>
    </div>
  )
}

interface StreamingAssistantBubbleProps {
  content: string
  progress: ChatProgressItem[]
  error: string | null
  isStreaming: boolean
}

export function StreamingAssistantBubble({
  content,
  progress,
  error,
  isStreaming,
}: StreamingAssistantBubbleProps) {
  const empty = !content && !error

  return (
    <div className="flex gap-3">
      <AgentAvatar />
      <div className="min-w-0 flex-1 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <ProgressTimeline items={progress} />

        {empty && isStreaming && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Agent is working…
          </div>
        )}

        {content && (
          <div className="relative">
            <AgentMarkdown content={content} />
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-green-600 align-middle dark:bg-green-400"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {error && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive",
              content && "mt-3",
            )}
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatErrorBubble({ message }: { message: string }) {
  return (
    <div className="flex justify-center">
      <div className="flex max-w-2xl items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="break-words">{message}</span>
      </div>
    </div>
  )
}
