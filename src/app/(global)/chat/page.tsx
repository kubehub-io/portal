"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Bot,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import type { ChatMessage } from "@/lib/api/agent-chat"
import {
  CHAT_THREADS_KEY,
  chatMessagesKey,
  useChatMessages,
  useChatStream,
  useChatThreads,
  useCreateChatThread,
} from "@/hooks/use-agent-chat"
import { useClusterStore } from "@/stores/cluster-store"
import { useNow } from "@/hooks/use-now"
import { deriveThreadTitle, threadTitle } from "@/lib/chat"
import { ChatComposer } from "@/components/chat/chat-composer"
import {
  ChatErrorBubble,
  ChatMessageBubble,
  StreamingAssistantBubble,
} from "@/components/chat/message-bubble"
import { ChatThreadList } from "@/components/chat/thread-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const SUGGESTIONS = [
  "Why is my application pod restarting?",
  "Check whether 10.10.1.138 is reachable on port 80",
  "Investigate high CPU usage in my cluster",
]

function EmptyChat({
  onSuggestion,
  hasCluster,
}: {
  onSuggestion: (value: string) => void
  hasCluster: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">How can I help?</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {hasCluster
          ? "Ask the KubeHub support agent about your clusters, workloads, networking, or anything else you are troubleshooting."
          : "Select a cluster in the sidebar to start a support conversation."}
      </p>
      {hasCluster && (
        <div className="mt-5 flex w-full max-w-xl flex-col gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentChatPage() {
  const queryClient = useQueryClient()
  const threadsQuery = useChatThreads()
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const now = useNow(60_000)

  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [newChat, setNewChat] = useState(false)
  const [draft, setDraft] = useState("")
  const [pendingUser, setPendingUser] = useState<ChatMessage | null>(null)
  const [activeStreamThread, setActiveStreamThread] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Default to the newest thread until the user explicitly starts a new chat.
  const effectiveSelectedID = useMemo(() => {
    if (newChat) return null
    if (selectedID && threads.some((thread) => thread.id === selectedID)) {
      return selectedID
    }
    return threads[0]?.id ?? null
  }, [newChat, selectedID, threads])

  const messagesQuery = useChatMessages(effectiveSelectedID)
  const { mutateAsync: createThread, isPending: isCreatingThread } = useCreateChatThread()
  const {
    send,
    reset: resetStream,
    isStreaming,
    content: streamContent,
    progress: streamProgress,
    error: streamError,
  } = useChatStream()

  const activeCluster = useClusterStore((state) => state.activeCluster)
  const canCreateThread = Boolean(activeCluster?.metadata.name)
  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === effectiveSelectedID) ?? null,
    [threads, effectiveSelectedID],
  )

  const displayMessages = useMemo(() => {
    const serverMessages = messagesQuery.data ?? []
    if (!pendingUser || pendingUser.thread_id !== effectiveSelectedID) {
      return serverMessages
    }
    return [...serverMessages, pendingUser]
  }, [messagesQuery.data, pendingUser, effectiveSelectedID])

  const showStream =
    activeStreamThread === effectiveSelectedID &&
    (isStreaming || streamContent.length > 0 || streamProgress.length > 0 || !!streamError)

  const showInitialLoading =
    !!effectiveSelectedID && messagesQuery.isLoading && !pendingUser && !showStream

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [displayMessages.length, streamContent, streamProgress.length, showStream, sendError])

  useEffect(() => {
    stickToBottom.current = true
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [effectiveSelectedID])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || isStreaming || isCreatingThread) return

    setSendError(null)
    let threadID = effectiveSelectedID

    if (!threadID) {
      const clusterName = activeCluster?.metadata.name
      if (!clusterName) {
        setSendError("Select a cluster in the sidebar before starting a new chat.")
        return
      }

      try {
        const thread = await createThread({
          title: deriveThreadTitle(text),
          cluster_name: clusterName,
        })
        threadID = thread.id
        setSelectedID(threadID)
        setNewChat(false)
      } catch (error) {
        setSendError(
          error instanceof Error ? error.message : "Failed to create a conversation",
        )
        return
      }
    }

    setDraft("")
    stickToBottom.current = true
    setPendingUser({
      id: `local-${Date.now()}`,
      thread_id: threadID,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    })
    setActiveStreamThread(threadID)

    const result = await send(threadID, text)
    if (!result.ok) {
      setSendError(result.error ?? "The agent run failed")
    }

    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatMessagesKey(threadID) }),
        queryClient.invalidateQueries({ queryKey: CHAT_THREADS_KEY }),
      ])
    } finally {
      setPendingUser(null)
      setActiveStreamThread(null)
      resetStream()
    }
  }, [
    draft,
    isStreaming,
    isCreatingThread,
    effectiveSelectedID,
    createThread,
    activeCluster,
    send,
    queryClient,
    resetStream,
  ])

  const startNewChat = useCallback(() => {
    if (isStreaming || isCreatingThread || !canCreateThread) return
    setNewChat(true)
    setSelectedID(null)
    setDraft("")
    setPendingUser(null)
    setActiveStreamThread(null)
    setSendError(null)
    resetStream()
  }, [isStreaming, isCreatingThread, canCreateThread, resetStream])

  const selectThread = useCallback((threadID: string) => {
    setNewChat(false)
    setSelectedID(threadID)
    setDraft("")
    setSendError(null)
  }, [])

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[560px] flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent chat</h2>
          <p className="text-muted-foreground">
            Troubleshoot your clusters with the KubeHub support agent.
          </p>
        </div>
        <Button
          onClick={startNewChat}
          disabled={isStreaming || isCreatingThread || !canCreateThread}
          title={canCreateThread ? undefined : "Select a cluster to start a new chat"}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <aside className="h-44 shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm md:h-auto md:w-72">
          <ChatThreadList
            threads={threads}
            selectedID={effectiveSelectedID}
            onSelect={selectThread}
            onNew={startNewChat}
            canCreate={canCreateThread}
            isLoading={threadsQuery.isLoading}
            isError={threadsQuery.isError}
            errorMessage={
              threadsQuery.error instanceof Error ? threadsQuery.error.message : undefined
            }
            onRetry={() => void threadsQuery.refetch()}
            now={now}
          />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">
                {selectedThread ? threadTitle(selectedThread) : "New conversation"}
              </h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {selectedThread?.cluster_id
                  ? `Cluster: ${selectedThread.cluster_id}`
                  : activeCluster?.metadata.name
                    ? `New chats linked to ${activeCluster.metadata.name}`
                    : "Select a cluster to start a chat"}
              </p>
            </div>
            {selectedThread?.cluster_id && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {selectedThread.cluster_id}
              </Badge>
            )}
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Responding
              </span>
            )}
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
          >
            {showInitialLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                {!effectiveSelectedID && displayMessages.length === 0 && !showStream ? (
                  <EmptyChat onSuggestion={setDraft} hasCluster={canCreateThread} />
                ) : displayMessages.length === 0 &&
                  !showStream &&
                  !sendError &&
                  !messagesQuery.isError ? (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <Bot className="mb-3 h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">
                      No messages yet. Ask a question below to get started.
                    </p>
                  </div>
                ) : null}

                {displayMessages.map((message) => (
                  <ChatMessageBubble key={message.id} message={message} />
                ))}

                {showStream && (
                  <StreamingAssistantBubble
                    content={streamContent}
                    progress={streamProgress}
                    error={streamError}
                    isStreaming={isStreaming}
                  />
                )}

                {sendError && !showStream && <ChatErrorBubble message={sendError} />}

                {messagesQuery.isError && !showStream && (
                  <div className="flex flex-col items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                    <span>
                      Failed to load messages:{" "}
                      {messagesQuery.error instanceof Error
                        ? messagesQuery.error.message
                        : "Unknown error"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void messagesQuery.refetch()}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void handleSend()}
            isStreaming={isStreaming}
            disabled={
              isCreatingThread || (!effectiveSelectedID && !canCreateThread)
            }
            placeholder={
              selectedThread?.cluster_id
                ? `Ask about ${selectedThread.cluster_id}…`
                : canCreateThread
                  ? "Ask the KubeHub agent…"
                  : "Select a cluster in the sidebar to start a chat"
            }
          />
        </section>
      </div>
    </div>
  )
}
