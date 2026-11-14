"use client"

import { useCallback, useRef, useState } from "react"
import { getK8sApiBase } from "@/lib/api/k8s-client"
import { getConfig } from "@/lib/config"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterStore } from "@/stores/cluster-store"

const SANDBOX_NAMESPACE = "agent-sandbox"
const SANDBOX_RUNTIME_CLASS = "gvisor"
const SANDBOX_API = "agents.x-k8s.io/v1beta1"
const SANDBOX_RESOURCE = "sandboxes"
const POD_NAME_ANNOTATION = "agents.x-k8s.io/pod-name"
// This is a lease, not the session lifetime. It is renewed while this browser
// tab is alive; if the tab crashes or closes without cleanup, the last lease
// expires and the controller deletes the Sandbox.
const SANDBOX_LEASE_SECONDS = 5 * 60
const SANDBOX_LEASE_RENEWAL_MS = 60_000
const READY_TIMEOUT_MS = 120_000
const DEFAULT_SANDBOX_IMAGE = "ghcr.io/kubehub-io/portal-sandboxd:main-20261013-2"

function shutdownTime(): string {
  return new Date(Date.now() + SANDBOX_LEASE_SECONDS * 1000).toISOString()
}

function shellName(): string {
  const key = "kubehub:agent-sandbox-session"
  let sessionId = ""
  try {
    sessionId = sessionStorage.getItem(key) ?? ""
    if (!sessionId) {
      sessionId = crypto.randomUUID().slice(0, 8)
      sessionStorage.setItem(key, sessionId)
    }
  } catch {
    sessionId = crypto.randomUUID().slice(0, 8)
  }
  return `portal-shell-${sessionId}`
}

function getHeaders(token: string, dns: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Host: dns,
    ...(json ? { "Content-Type": "application/json" } : {}),
  }
}

async function requestJson(
  url: string,
  token: string,
  dns: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      ...getHeaders(token, dns, init.body !== undefined),
      ...(init.method === "PATCH" ? { "Content-Type": "application/merge-patch+json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`${init.method ?? "GET"} ${response.status}: ${detail || response.statusText}`)
  }
  return (await response.json()) as Record<string, unknown>
}

async function deleteResource(url: string, token: string, dns: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    cache: "no-store",
    headers: getHeaders(token, dns),
  })
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${response.status}: ${await response.text().catch(() => "")}`)
  }
}

async function ensureSandboxNamespace(base: string, token: string, dns: string): Promise<void> {
  const url = `${base}/api/v1/namespaces/${SANDBOX_NAMESPACE}`
  try {
    await requestJson(url, token, dns)
    return
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("GET 404")) throw error
  }

  try {
    await requestJson(`${base}/api/v1/namespaces`, token, dns, {
      method: "POST",
      body: JSON.stringify({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: { name: SANDBOX_NAMESPACE },
      }),
    })
  } catch (error) {
    // Another controller/tab may have created it between GET and POST.
    if (!(error instanceof Error) || !error.message.startsWith("POST 409")) throw error
  }
}

async function ensureSandboxRuntimeClass(base: string, token: string, dns: string): Promise<void> {
  const url = `${base}/apis/node.k8s.io/v1/runtimeclasses/${SANDBOX_RUNTIME_CLASS}`
  try {
    await requestJson(url, token, dns)
    return
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("GET 404")) throw error
  }

  try {
    await requestJson(`${base}/apis/node.k8s.io/v1/runtimeclasses`, token, dns, {
      method: "POST",
      body: JSON.stringify({
        apiVersion: "node.k8s.io/v1",
        kind: "RuntimeClass",
        metadata: { name: SANDBOX_RUNTIME_CLASS },
        handler: "runsc",
      }),
    })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("POST 409")) throw error
  }
}

function condition(status: Record<string, unknown> | undefined, type: string) {
  const conditions = status?.conditions
  if (!Array.isArray(conditions)) return undefined
  return conditions.find((item) => {
    const c = item as Record<string, unknown>
    return c.type === type
  }) as Record<string, unknown> | undefined
}

function isReady(status: Record<string, unknown> | undefined): boolean {
  return condition(status, "Ready")?.status === "True"
}

function getPodName(sandbox: Record<string, unknown>): string | undefined {
  const metadata = sandbox.metadata as Record<string, unknown> | undefined
  const annotations = metadata?.annotations as Record<string, unknown> | undefined
  return typeof annotations?.[POD_NAME_ANNOTATION] === "string"
    ? annotations[POD_NAME_ANNOTATION]
    : typeof metadata?.name === "string"
      ? metadata.name
      : undefined
}

function toWsUrl(url: string): string {
  return url.replace(/^https:/, "wss:").replace(/^http:/, "ws:")
}

function tokenForSubprotocol(token: string): string {
  return btoa(token).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

/** Writes the user's kubeconfig-in-cluster files without blocking shell startup. */
async function injectShellCredentials(
  base: string,
  dns: string,
  podNamespace: string,
  kubectlNamespace: string,
  podName: string,
  token: string,
): Promise<void> {
  const dir = "/var/run/secrets/kubernetes.io/serviceaccount"
  const command =
    `mkdir -p ${dir} && ` +
    `if [ -f /tmp/sa-ca/ca.crt ]; then cp /tmp/sa-ca/ca.crt ${dir}/ca.crt; fi && ` +
    `printf '%s' '${token}' > ${dir}/token && ` +
    `printf '%s' '${kubectlNamespace}' > ${dir}/namespace && ` +
    `echo 'kube credentials: OK'`
  const url = new URL(`${base}/api/v1/namespaces/${podNamespace}/pods/${podName}/exec`)
  for (const value of ["sh", "-c", command]) url.searchParams.append("command", value)
  url.searchParams.set("stdin", "false")
  url.searchParams.set("stdout", "true")
  url.searchParams.set("stderr", "true")
  url.searchParams.set("tty", "false")

  const socket = new WebSocket(toWsUrl(url.toString()), [
    "v5.channel.k8s.io",
    `base64url.bearer.authorization.k8s.io.${tokenForSubprotocol(token)}`,
  ])
  socket.binaryType = "arraybuffer"

  await new Promise<void>((resolve, reject) => {
    let output = ""
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error("Timed out injecting kube credentials"))
    }, 15_000)
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      if (error) reject(error)
      else resolve()
    }
    socket.onmessage = (event) => {
      const data = new Uint8Array(event.data as ArrayBuffer)
      output += new TextDecoder().decode(data.slice(1))
      if (output.includes("kube credentials: OK")) {
        finish()
        socket.close()
      }
    }
    socket.onerror = () => finish(new Error("WebSocket error injecting kube credentials"))
    socket.onclose = () => {
      if (output.includes("kube credentials: OK")) finish()
      else finish(new Error(output.trim() || "Credential injection failed"))
    }
  })
}

interface SandboxHandle {
  name: string
  namespace: string
  podName: string
}

interface SandboxLease {
  handle: SandboxHandle
  base: string
  dns: string
  timer: ReturnType<typeof setInterval> | null
}

let activeLease: SandboxLease | null = null

async function renewLease(): Promise<void> {
  if (!activeLease) return
  const token = useAuthStore.getState().accessToken
  if (!token) return
  const { handle, base, dns } = activeLease
  await fetch(`${base}/apis/${SANDBOX_API}/namespaces/${handle.namespace}/${SANDBOX_RESOURCE}/${handle.name}`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      ...getHeaders(token, dns),
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({
      spec: { shutdownTime: shutdownTime(), shutdownPolicy: "Delete" },
    }),
  }).catch(() => {
    // A later renewal can recover from a transient API failure. The existing
    // deadline remains the safety net if the browser stays disconnected.
  })
}

function startLease(handle: SandboxHandle, base: string, dns: string): void {
  if (activeLease?.timer) clearInterval(activeLease.timer)
  const timer = setInterval(() => { void renewLease() }, SANDBOX_LEASE_RENEWAL_MS)
  activeLease = { handle, base, dns, timer }
}

function pauseLeaseRenewal(): void {
  if (!activeLease?.timer) return
  clearInterval(activeLease.timer)
  activeLease.timer = null
}

function resumeLeaseRenewal(): void {
  if (!activeLease || activeLease.timer) return
  activeLease.timer = setInterval(() => { void renewLease() }, SANDBOX_LEASE_RENEWAL_MS)
}

async function expireActiveLease(): Promise<void> {
  const lease = activeLease
  if (!lease) return
  activeLease = null
  if (lease.timer) clearInterval(lease.timer)
  const token = useAuthStore.getState().accessToken
  if (!token) return
  await deleteResource(
    `${lease.base}/apis/${SANDBOX_API}/namespaces/${lease.handle.namespace}/${SANDBOX_RESOURCE}/${lease.handle.name}`,
    token,
    lease.dns,
  ).catch(() => {})
}

if (typeof window !== "undefined") {
  // Stop renewing on tab close/navigation. The last shutdownTime then expires
  // naturally; this deliberately does not rely on an unload request succeeding.
  window.addEventListener("pagehide", pauseLeaseRenewal)
  window.addEventListener("pageshow", resumeLeaseRenewal)
}

async function waitForSandbox(
  base: string,
  token: string,
  dns: string,
  name: string,
  isAborted: () => boolean,
): Promise<string> {
  const url = `${base}/apis/${SANDBOX_API}/namespaces/${SANDBOX_NAMESPACE}/${SANDBOX_RESOURCE}/${name}`
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (isAborted()) throw new Error("Sandbox startup cancelled")
    const object = await requestJson(`${url}?shellCheck=${Date.now()}`, token, dns)
    const status = object.status as Record<string, unknown> | undefined

    if (isReady(status)) {
      const podName = getPodName(object)
      if (podName) return podName
    }

    const ready = condition(status, "Ready")
    if (ready?.status === "False" && ["InvalidConfiguration", "PodFailed", "PodSucceeded", "ClaimExpired", "SandboxExpired"].includes(String(ready.reason))) {
      throw new Error(String(ready.message ?? `Sandbox ${name} failed to become ready`))
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("Timed out waiting for sandbox to become ready")
}

async function createSandbox(
  base: string,
  token: string,
  dns: string,
  name: string,
  image: string,
  isAborted: () => boolean,
): Promise<SandboxHandle> {
  const sandboxUrl = `${base}/apis/${SANDBOX_API}/namespaces/${SANDBOX_NAMESPACE}/${SANDBOX_RESOURCE}/${name}`

  // Re-open the same browser-session Sandbox when the dock is remounted.
  try {
    const sandbox = await requestJson(sandboxUrl, token, dns)
    const sandboxSpec = sandbox.spec as Record<string, unknown> | undefined
    const sandboxPodTemplate = sandboxSpec?.podTemplate as Record<string, unknown> | undefined
    const sandboxPodSpec = sandboxPodTemplate?.spec as Record<string, unknown> | undefined
    const sandboxContainer = Array.isArray(sandboxPodSpec?.containers)
      ? sandboxPodSpec.containers.find((item) => (item as Record<string, unknown>)?.name === "sandboxd") as Record<string, unknown> | undefined
      : undefined
    const sandboxContainerSecurity = sandboxContainer?.securityContext as Record<string, unknown> | undefined
    const runsAsRoot =
      sandboxContainerSecurity?.runAsUser === 0 &&
      sandboxContainerSecurity?.runAsGroup === 0 &&
      sandboxContainerSecurity?.runAsNonRoot === false

    // Pod templates are immutable once the controller has created the pod.
    // Remove an older non-root Sandbox so the next create uses the root/gVisor
    // configuration below.
    if (!runsAsRoot) {
      await deleteResource(sandboxUrl, token, dns)
    } else {
      // Sandbox lifecycle fields are inline on SandboxSpec (unlike the
      // nested lifecycle object on SandboxClaim).
      await requestJson(sandboxUrl, token, dns, {
        method: "PATCH",
        body: JSON.stringify({ spec: { shutdownTime: shutdownTime(), shutdownPolicy: "Delete" } }),
      })
    }
    return {
      name,
      namespace: SANDBOX_NAMESPACE,
      podName: await waitForSandbox(base, token, dns, name, isAborted),
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("GET 404")) throw error
  }

  const lifecycle = { shutdownTime: shutdownTime(), shutdownPolicy: "Delete" }
  const podSpec = {
    runtimeClassName: "gvisor",
    automountServiceAccountToken: false,
    containers: [{
      name: "sandboxd",
      image,
      imagePullPolicy: "IfNotPresent",
      env: [
        { name: "HOME", value: "/workspace" },
        { name: "PS1", value: "sandbox@\\h:\\w\\$ " },
      ],
      ports: [{ containerPort: 8080, protocol: "TCP" }, { containerPort: 9090, protocol: "TCP" }],
      readinessProbe: { httpGet: { path: "/v1/health", port: 8080 } },
      resources: { requests: { cpu: "250m", "ephemeral-storage": "1Gi", memory: "512Mi" } },
      securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] }, runAsGroup: 0, runAsNonRoot: false, runAsUser: 0 },
      volumeMounts: [
        { name: "workspace", mountPath: "/workspace" },
        { name: "satoken", mountPath: "/var/run/secrets/kubernetes.io/serviceaccount" },
        { name: "ca-crt", mountPath: "/tmp/sa-ca", readOnly: true },
      ],
    }],
    restartPolicy: "OnFailure",
    securityContext: { fsGroup: 0, runAsNonRoot: false, runAsUser: 0, runAsGroup: 0 },
    volumes: [{ name: "workspace", emptyDir: {} }, { name: "satoken", emptyDir: {} }, { name: "ca-crt", configMap: { name: "kube-root-ca.crt" } }],
  }
  const sandboxCollectionUrl = `${base}/apis/${SANDBOX_API}/namespaces/${SANDBOX_NAMESPACE}/${SANDBOX_RESOURCE}`
  try {
    await requestJson(sandboxCollectionUrl, token, dns, {
      method: "POST",
      body: JSON.stringify({
        apiVersion: SANDBOX_API,
        kind: "Sandbox",
        metadata: { name, namespace: SANDBOX_NAMESPACE },
        spec: {
          podTemplate: { spec: podSpec },
          failedPodPolicy: "Retain",
          operatingMode: "Running",
          ...lifecycle,
        },
      }),
    })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("POST 409")) throw error
  }
  return {
    name,
    namespace: SANDBOX_NAMESPACE,
    podName: await waitForSandbox(base, token, dns, name, isAborted),
  }
}

export type ClusterShellPhase =
  | "idle"
  | "checking"
  | "creating"
  | "waiting"
  | "ready"
  | "disabled"
  | "error"

interface ClusterShellState {
  phase: ClusterShellPhase
  error: string | null
  podName: string
  namespace: string
}

export function useClusterShell() {
  const [state, setState] = useState<ClusterShellState>({
    phase: "idle",
    error: null,
    podName: "",
    namespace: SANDBOX_NAMESPACE,
  })
  const [podNodeName] = useState<string | null>(null)
  const startedRef = useRef(false)
  const abortRef = useRef(false)
  const handleRef = useRef<SandboxHandle | null>(null)

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
    const enabledControllers = cluster.spec.managedControllerProfile?.enabledControllers ?? []
    if (!enabledControllers.includes("agent-sandbox")) {
      setState((s) => ({
        ...s,
        phase: "disabled",
        error: "Enable the Agent Sandbox managed controller in Cluster Settings to use the shell.",
      }))
      return
    }

    try {
      setState((s) => ({ ...s, phase: "checking", error: null }))
      const base = getK8sApiBase(cluster)
      await ensureSandboxNamespace(base, token, cluster.status.publicDns)
      await ensureSandboxRuntimeClass(base, token, cluster.status.publicDns)
      const name = shellName()
      const config = await getConfig()
      const image = config.webShellConfig?.sandboxImage ?? DEFAULT_SANDBOX_IMAGE
      setState((s) => ({ ...s, phase: "creating" }))
      const handle = await createSandbox(base, token, cluster.status.publicDns, name, image, () => abortRef.current)
      handleRef.current = handle
      if (abortRef.current) return
      startLease(handle, base, cluster.status.publicDns)
      setState({ phase: "ready", error: null, podName: handle.podName, namespace: handle.namespace })
      void injectShellCredentials(
        base,
        cluster.status.publicDns,
        handle.namespace,
        useClusterStore.getState().activeNamespace === "__all"
          ? "default"
          : useClusterStore.getState().activeNamespace || "default",
        handle.podName,
        token,
      ).catch(() => {})
    } catch (error) {
      if (abortRef.current) return
      setState((s) => ({
        ...s,
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [])

  const cleanup = useCallback(async () => {
    abortRef.current = true
    handleRef.current = null
    await expireActiveLease()
  }, [])

  const retry = useCallback(() => {
    startedRef.current = false
    void start()
  }, [start])

  return { ...state, start, retry, podNodeName, cleanup }
}
