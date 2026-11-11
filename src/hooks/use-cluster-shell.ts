"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useClusterStore } from "@/stores/cluster-store"
import { useAuthStore } from "@/stores/auth-store"
import { getConfigSync } from "@/lib/config"

function getWebShellConfig() {
  const { webShellConfig } = getConfigSync()
  return webShellConfig ?? { image: "", specVersion: "2" }
}

function getDefaultPodSpec(nodeName?: string): Record<string, unknown> {
  const { image, specVersion } = getWebShellConfig()
  const spec: Record<string, unknown> = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "shell-pod",
      namespace: "default",
      annotations: {
        "shell.kubehub.io/spec-version": specVersion,
      },
    },
    spec: {
      serviceAccountName: "default",
      automountServiceAccountToken: false,
      hostUsers: false,
      volumes: [
        {
          name: "satoken",
          emptyDir: {},
        },
        {
          name: "ca-crt",
          configMap: { name: "kube-root-ca.crt" },
        },
      ],
      containers: [
        {
          name: "debug-container",
          image,
          command: ["sleep", "infinity"],
          securityContext: {
            runAsUser: 0,
            runAsGroup: 0,
            allowPrivilegeEscalation: true,
          },
          imagePullPolicy: "IfNotPresent",
          volumeMounts: [
            {
              name: "satoken",
              mountPath: "/var/run/secrets/kubernetes.io/serviceaccount",
            },
            {
              name: "ca-crt",
              mountPath: "/tmp/sa-ca",
            },
          ],
        },
      ],
    },
  }
  if (nodeName) {
    const podSpec = spec["spec"] as Record<string, unknown>
    podSpec.nodeName = nodeName
  }
  return spec
}

export type ClusterShellPhase =
  | "idle"
  | "checking"
  | "recreating"
  | "creating"
  | "waiting"
  | "writing-token"
  | "ready"
  | "error"

interface ClusterShellState {
  phase: ClusterShellPhase
  error: string | null
  podName: string
  namespace: string
}

function getK8sHost(dns: string): string {
  return `https://${dns}:8443`
}

function toWsUrl(url: string): string {
  return url.replace(/^https:/, "wss:").replace(/^http:/, "ws:")
}

const PROXY_ERROR_RE = /proxy error from konnect-srv.*?while dialing (\d+\.\d+\.\d+\.\d+):10250/
const NO_NODE_ERROR_RE = /serviceaccount\s+"[^"]*"\s+not found/

function formatError(msg: string, nodeName?: string): string {
  const proxyMatch = msg.match(PROXY_ERROR_RE)
  if (proxyMatch) {
    const ip = proxyMatch[1]
    if (nodeName) {
      return `node ${nodeName} (${ip}) not reachable.`
    }
    return `node ${ip} not reachable.`
  }
  if (NO_NODE_ERROR_RE.test(msg)) {
    return "Cluster has no active nodes — shell requires at least one node."
  }
  return msg
}

function base64url(token: string): string {
  return btoa(token).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export async function updateShellPodToken(
  dns: string,
  namespace: string,
  podName: string,
  token: string,
): Promise<void> {
  const host = getK8sHost(dns)
  const dir = "/var/run/secrets/kubernetes.io/serviceaccount"

  const escapedToken = `'${token}'`
  const cmd =
    `echo '--- updating serviceaccount token ---' && ` +
    `printf '%s' ${escapedToken} > ${dir}/token && ` +
    `echo 'token: OK'`

  const url = new URL(`${host}/api/v1/namespaces/${namespace}/pods/${podName}/exec`)
  url.searchParams.append("command", "sh")
  url.searchParams.append("command", "-c")
  url.searchParams.append("command", cmd)
  url.searchParams.set("stdin", "false")
  url.searchParams.set("stdout", "true")
  url.searchParams.set("stderr", "true")
  url.searchParams.set("tty", "false")

  const wsUrl = toWsUrl(url.toString())
  const ws = new WebSocket(wsUrl, [
    "v5.channel.k8s.io",
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`,
  ])

  ws.binaryType = "arraybuffer"

  return new Promise((resolve, reject) => {
    let output = ""
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer)
      const channel = data[0]
      const text = new TextDecoder().decode(data.slice(1))
      if (channel >= 1 && channel <= 3) {
        output += text
      }
      if (channel === 3) {
        try {
          const status = JSON.parse(text) as { status?: string; message?: string }
          if (status.status === "Success") {
            finish()
            ws.close()
            return
          }
          if (status.status === "Failure") {
            finish(new Error(status.message || "Exec command failed"))
            ws.close()
            return
          }
        } catch {
          // Some API/proxy versions send a plain-text status frame.
        }
      }
      if (output.includes("token: OK")) {
        finish()
        ws.close()
      }
    }

    const timeout = setTimeout(() => {
      ws.close()
      finish(new Error("Timeout updating token in pod"))
    }, 15_000)

    ws.onclose = () => {
      if (output.includes("token: OK")) {
        finish()
      } else {
        finish(new Error(output.trim() || "Unknown error updating token"))
      }
    }

    ws.onerror = () => {
      finish(new Error("WebSocket error while updating token"))
    }
  })
}

export function useClusterShell(nodeName?: string) {
  const spec = useMemo(() => getDefaultPodSpec(nodeName), [nodeName])
  const meta = spec["metadata"] as Record<string, unknown> | undefined
  const podName = (meta?.["name"] as string) ?? "shell-pod"
  const namespace = (meta?.["namespace"] as string) ?? "default"

  const [state, setState] = useState<ClusterShellState>({
    phase: "idle",
    error: null,
    podName,
    namespace,
  })

  const [podNodeName, setPodNodeName] = useState<string | null>(null)

  const startedRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef(false)
  const prevNodeNameRef = useRef(nodeName)

  const start = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    abortRef.current = false

    const cluster = useClusterStore.getState().activeCluster
    const token = useAuthStore.getState().accessToken
    if (!cluster || !token) {
      setState((s) => ({ ...s, phase: "error", error: "No active cluster or not authenticated" }))
      return
    }

    const dns = cluster.status.publicDns
    const host = getK8sHost(dns)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Host: dns,
      "Content-Type": "application/json",
    }

    try {
      setState((s) => ({ ...s, phase: "checking", error: null }))

      // Step 1: Ensure pod exists with the current spec version and nodeName
      const podsUrl = `${host}/api/v1/namespaces/${namespace}/pods`
      const podUrl = `${podsUrl}/${podName}`

      // Check nodes in parallel to detect clusters with no active nodes
      const nodeUrl = `${host}/api/v1/nodes`

      let podReady = false
      let podAlreadyRunning = false
      let checkedPodNodeName: string | undefined
      while (!podReady) {
        if (abortRef.current) return

        const [getRes, nodeRes] = await Promise.all([
          // Pod phase is deliberately polled; never allow the browser or an
          // intermediary cache to return the first Pending response forever.
          fetch(`${podUrl}?shellCheck=${Date.now()}`, { headers, cache: "no-store" }),
          fetch(nodeUrl, { headers, cache: "no-store" }),
        ])

        if (getRes.status === 404) {
          // Create pod
          setState((s) => ({ ...s, phase: "creating" }))
          const createRes = await fetch(podsUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(spec),
          })
          if (!createRes.ok) {
            const errBody = await createRes.text()
            throw new Error(`Failed to create pod: ${createRes.status} ${errBody}`)
          }
          podReady = true
        } else if (!getRes.ok) {
          // If the pod check fails, check if the cluster has no nodes
          if (nodeRes.ok) {
            const nodeList = await nodeRes.json() as { items?: unknown[] }
            if (!nodeList.items || nodeList.items.length === 0) {
              throw new Error("Cluster has no active nodes — shell requires at least one node.")
            }
          }
          throw new Error(`Failed to check pod: ${getRes.status}`)
        } else {
          // Pod exists — check spec version and nodeName match
          const existing = (await getRes.json()) as {
            metadata?: { annotations?: Record<string, string> }
            spec?: { nodeName?: string }
            status?: { phase?: string }
          }
          const existingVersion = existing?.metadata?.annotations?.["shell.kubehub.io/spec-version"]
          const existingNodeName = existing?.spec?.nodeName
          const desiredNodeName = nodeName || undefined
          const versionMatch = existingVersion === getWebShellConfig().specVersion
          const nodeMatch = !desiredNodeName || existingNodeName === desiredNodeName

          if (versionMatch && nodeMatch) {
            podReady = true
            checkedPodNodeName = existingNodeName
            // Do not throw away the status from the check we just made. In
            // particular, an already-running shell pod should go straight to
            // credential setup instead of waiting for a second polling loop.
            podAlreadyRunning = existing.status?.phase === "Running"
          } else {
            // Delete outdated pod and loop back to create
            setState((s) => ({ ...s, phase: "recreating" }))
            const delRes = await fetch(podUrl, { method: "DELETE", headers })
            if (!delRes.ok) {
              const errBody = await delRes.text()
              throw new Error(`Failed to delete outdated pod: ${delRes.status} ${errBody}`)
            }
            // Wait for actual deletion
            for (;;) {
              if (abortRef.current) return
              const checkRes = await fetch(podUrl, { headers, cache: "no-store" })
              if (checkRes.status === 404) break
              await new Promise((r) => setTimeout(r, 1000))
            }
          }
        }
      }

      // Step 2: Wait for pod to be Running
      setState((s) => ({ ...s, phase: "waiting" }))

      const running =
        podAlreadyRunning ||
        (await waitForPodRunning(dns, namespace, podName, token, () => abortRef.current))
      if (!running) return

      // Fetch node name for better error messages and display
       // The initial pod check already contains spec.nodeName for an existing
       // pod. Reuse it so credential injection cannot be blocked by a second
       // status GET before the exec WebSocket is opened.
       const pnn = checkedPodNodeName ?? await getPodNodeName(dns, namespace, podName, token)
      setPodNodeName(pnn ?? null)

       // Step 3: Write CA cert, namespace, and access token into the pod.
       // This is a convenience operation and must not block the interactive
       // shell. Some API proxies keep exec WebSockets open after the command
       // completes, so waiting here can leave the whole panel stuck forever.
       setState((s) => ({ ...s, phase: "ready", error: null }))
       void writeFilesToPod(dns, namespace, podName, token, pnn, () => abortRef.current).catch((err) => {
         if (abortRef.current) return
         setState((s) => ({
           ...s,
           phase: "ready",
           error: `Shell connected, but credentials could not be injected: ${
             err instanceof Error ? err.message : String(err)
           }`,
         }))
       })

       if (abortRef.current) return
    } catch (err) {
      if (abortRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      setState((s) => ({
        ...s,
        phase: "error",
        error: formatError(msg),
      }))
    }
  }, [podName, namespace, spec, nodeName])

  // Auto-restart when nodeName changes
  useEffect(() => {
    if (prevNodeNameRef.current !== nodeName) {
      prevNodeNameRef.current = nodeName
      abortRef.current = true
      startedRef.current = false
      start()
    }
  }, [nodeName, start])

  useEffect(() => {
    return () => {
      abortRef.current = true
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const retry = useCallback(() => {
    startedRef.current = false
    start()
  }, [start])

  return { ...state, start, retry, podNodeName }
}

async function waitForPodRunning(
  dns: string,
  namespace: string,
  podName: string,
  token: string,
  isAborted: () => boolean,
): Promise<boolean> {
  const host = getK8sHost(dns)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Host: dns,
  }

  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    if (isAborted()) return false

    // `no-store` prevents browser caching, while the nonce also bypasses
    // caches in front of the Kubernetes API. Without both, a cached Pending
    // response can make this loop appear to stop polling entirely.
    const url = `${host}/api/v1/namespaces/${namespace}/pods/${podName}?shellPoll=${Date.now()}`
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: controller.signal,
    })
    window.clearTimeout(timeout)
    if (!res.ok) throw new Error(`Failed to get pod status: ${res.status}`)

    const pod = (await res.json()) as { status?: { phase?: string } }
    const phase = pod.status?.phase

    if (phase === "Running") return true
    if (phase === "Failed" || phase === "Unknown") {
      throw new Error(`Pod entered phase: ${phase}`)
    }

    await new Promise((r) => setTimeout(r, 1000))
  }

  throw new Error("Timed out waiting for pod to be Running")
}

async function getPodNodeName(dns: string, namespace: string, podName: string, token: string): Promise<string | undefined> {
  const host = getK8sHost(dns)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15_000)
  const res = await fetch(`${host}/api/v1/namespaces/${namespace}/pods/${podName}`, {
    headers: { Authorization: `Bearer ${token}`, Host: dns },
    cache: "no-store",
    signal: controller.signal,
  })
  window.clearTimeout(timeout)
  if (!res.ok) return undefined
  const pod = await res.json() as { spec?: { nodeName?: string } }
  return pod.spec?.nodeName
}

async function writeFilesToPod(
  dns: string,
  namespace: string,
  podName: string,
  token: string,
  nodeName: string | undefined,
  isAborted: () => boolean,
): Promise<void> {
  const host = getK8sHost(dns)
  const dir = "/var/run/secrets/kubernetes.io/serviceaccount"

  if (isAborted()) throw new Error("Aborted")

  const escapedToken = `'${token}'`
  const cmd =
    `echo '--- setting up serviceaccount ---' && ` +
    `cp /tmp/sa-ca/ca.crt ${dir}/ca.crt && ` +
    `echo 'ca.crt: OK' && ` +
    `printf 'default' > ${dir}/namespace && ` +
    `echo 'namespace: OK' && ` +
    `echo 'token: writing...' && ` +
    `printf '%s' ${escapedToken} > ${dir}/token && ` +
    `echo 'token: OK'`

  const url = new URL(`${host}/api/v1/namespaces/${namespace}/pods/${podName}/exec`)
  url.searchParams.append("command", "sh")
  url.searchParams.append("command", "-c")
  url.searchParams.append("command", cmd)
  url.searchParams.set("stdin", "false")
  url.searchParams.set("stdout", "true")
  url.searchParams.set("stderr", "true")
  url.searchParams.set("tty", "false")

  const wsUrl = toWsUrl(url.toString())
  const ws = new WebSocket(wsUrl, [
    "v5.channel.k8s.io",
    `base64url.bearer.authorization.k8s.io.${base64url(token)}`,
  ])

  ws.binaryType = "arraybuffer"

  return new Promise((resolve, reject) => {
    let output = ""
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer)
      const channel = data[0]
      const text = new TextDecoder().decode(data.slice(1))
      if (channel >= 1 && channel <= 3) {
        output += text
      }
      if (channel === 3) {
        try {
          const status = JSON.parse(text) as { status?: string; message?: string }
          if (status.status === "Success") {
            finish()
            ws.close()
            return
          }
          if (status.status === "Failure") {
            finish(new Error(formatError(status.message || "Exec command failed", nodeName)))
            ws.close()
            return
          }
        } catch {
          // Some API/proxy versions send a plain-text status frame.
        }
      }
      // The exec endpoint may keep the WebSocket open after the command has
      // completed. The success marker is the command-level completion signal;
      // do not wait forever for the server to close the stream.
      if (output.includes("token: OK")) {
        finish()
        ws.close()
      }
    }

    const timeout = setTimeout(() => {
      ws.close()
      finish(new Error(formatError(output.trim() || "Timeout writing files to pod", nodeName)))
    }, 15_000)

    ws.onclose = () => {
      if (!settled && !isAborted()) {
        if (output.includes("token: OK")) {
          finish()
        } else {
          finish(new Error(formatError(output.trim() || "Unknown error", nodeName)))
        }
      }
    }

    ws.onerror = () => {
      finish(new Error(formatError(output.trim() || "WebSocket error while writing files", nodeName)))
    }
  })
}
