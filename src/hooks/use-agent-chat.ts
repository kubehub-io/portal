"use client"

import { useCallback, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as agentChat from "@/lib/api/agent-chat"
import { useAuthStore } from "@/stores/auth-store"

export const CHAT_THREADS_KEY = ["agent-chat", "threads"] as const

export function chatMessagesKey(threadID: string | null) {
  return ["agent-chat", "threads", threadID ?? "none", "messages"] as const
}

export function useChatThreads() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: CHAT_THREADS_KEY,
    queryFn: agentChat.listThreads,
    enabled: isAuthenticated,
    retry: 1,
  })
}

export function useChatMessages(threadID: string | null) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: chatMessagesKey(threadID),
    queryFn: () => agentChat.listMessages(threadID!),
    enabled: !!threadID && isAuthenticated,
    retry: 1,
  })
}

export function useCreateChatThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: agentChat.createThread,
    onSuccess: (thread) => {
      qc.setQueryData<agentChat.ChatThread[]>(CHAT_THREADS_KEY, (current) => {
        if (!current) return [thread]
        return [thread, ...current.filter((item) => item.id !== thread.id)]
      })
      // Only the thread list changed; without `exact` this would also refetch
      // every thread's messages because their keys share this prefix.
      qc.invalidateQueries({ queryKey: CHAT_THREADS_KEY, exact: true })
    },
  })
}

// ── Streaming ────────────────────────────────────────────

export interface ChatProgressItem extends agentChat.AgentProgressEvent {
  /** Stable id for React keys. */
  id: number
  /** Client timestamp used by the activity timeline. */
  at: number
}

export interface ChatStreamState {
  isStreaming: boolean
  /** Assistant content accumulated from `token` events. */
  content: string
  /** Tool/command progress emitted while the agent works. */
  progress: ChatProgressItem[]
  error: string | null
  done: agentChat.AgentDoneEvent | null
}

const INITIAL_STATE: ChatStreamState = {
  isStreaming: false,
  content: "",
  progress: [],
  error: null,
  done: null,
}

export interface SendResult {
  ok: boolean
  error?: string
}

/**
 * Owns the lifetime of one agent run. Tokens are appended as they arrive, and
 * the stream is always closed when `send` resolves.
 */
export function useChatStream() {
  const [state, setState] = useState<ChatStreamState>(INITIAL_STATE)
  const sequence = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState(INITIAL_STATE)
  }, [])

  const send = useCallback(
    async (
      threadID: string,
      content: string,
      agentServiceAccount?: string,
    ): Promise<SendResult> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      sequence.current = 0
      setState({ ...INITIAL_STATE, isStreaming: true })

      let failure: string | null = null

      try {
        for await (const event of agentChat.streamMessage(threadID, content, {
          signal: controller.signal,
          agentServiceAccount,
        })) {
          if (event.type === "token") {
            setState((current) => ({ ...current, content: current.content + event.content }))
            continue
          }

          if (event.type === "progress") {
            sequence.current += 1
            const item: ChatProgressItem = {
              ...event.progress,
              id: sequence.current,
              at: Date.now(),
            }
            setState((current) => ({ ...current, progress: [...current.progress, item] }))
            continue
          }

          if (event.type === "error") {
            failure = event.message
            setState((current) => ({ ...current, error: event.message }))
            continue
          }

          if (event.type === "done") {
            if (event.done.status !== "completed") {
              failure =
                event.done.error ??
                (event.done.status === "failed"
                  ? "The agent run failed"
                  : event.done.status)
            }
            setState((current) => ({
              ...current,
              done: event.done,
              error:
                current.error ??
                event.done.error ??
                (event.done.status === "failed" ? "The agent run failed" : null),
            }))
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failure = error instanceof Error ? error.message : "The agent run failed"
          setState((current) => ({ ...current, error: failure }))
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setState((current) => ({ ...current, isStreaming: false }))
      }

      return failure ? { ok: false, error: failure } : { ok: true }
    },
    [],
  )

  return { ...state, send, reset }
}
