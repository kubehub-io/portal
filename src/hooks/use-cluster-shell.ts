"use client"

import { useCallback, useRef, useState } from "react"
import { getK8sApiBase } from "@/lib/api/k8s-client"
import { decodeToken } from "@/lib/auth/pkce"
import { getConfig } from "@/lib/config"
import { useAuthStore } from "@/stores/auth-store"
import { useClusterStore } from "@/stores/cluster-store"

const SANDBOX_NAMESPACE = "agent-sandbox"
const SANDBOX_RUNTIME_CLASS = "gvisor"
const SANDBOX_API = "agents.x-k8s.io/v1beta1"
const SANDBOX_RESOURCE = "sandboxes"
const POD_NAME_ANNOTATION = "agents.x-k8s.io/pod-name"
const CONFIG_FINGERPRINT_ANNOTATION = "shell.kubehub.io/config-hash"
const OWNER_ANNOTATION = "shell.kubehub.io/user"
const CONFIG_MAP_PREFIX = "shell-config-"
const CONFIG_MAP_KEY = "config.json"
const SANDBOX_NAME_PREFIX = "portal-shell-"
const WORKSPACE_VOLUME = "workspace"
// This is a lease, not the session lifetime. It is renewed while this browser
// tab is alive; if the tab crashes or closes without cleanup, the last lease
// expires and the controller tears down the Sandbox.
const SANDBOX_LEASE_SECONDS = 5 * 60
const SANDBOX_LEASE_RENEWAL_MS = 60_000
const READY_TIMEOUT_MS = 120_000
const DEFAULT_SANDBOX_IMAGE = "ghcr.io/kubehub-io/portal-sandboxd:main-20261013-2"
const DEFAULT_WORKSPACE_SIZE = "1Gi"

type Isolation = "gvisor" | "usernamespace"

/** Settings resolved from shell-config-<subject> in the agent-sandbox namespace. */
export interface ShellOptions {
  /** A workspace PVC is created only when storage is configured. */
  storageEnabled: boolean
  storageSize: string
  storageClass?: string
  isolation: Isolation
  image: string
}

function shutdownTime(): string {
  return new Date(Date.now() + SANDBOX_LEASE_SECONDS * 1000).toISOString()
}

/** Derive a DNS-safe suffix from the authenticated user's `sub` claim. */
function subjectSuffix(): string {
  const { accessToken, idToken } = useAuthStore.getState()
  const claims = (accessToken ? decodeToken(accessToken) : null) ?? (idToken ? decodeToken(idToken) : null)
  const sub = claims?.sub
  const value = typeof sub === "string" ? sub : ""
  const suffix = value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 200)
  return suffix || "unknown"
}

/**
 * JSON.parse rejects trailing commas and comments, both common in hand-edited
 * YAML block scalars. Strip them (while respecting strings) before parsing.
 */
function parseConfigJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    // fall through to the tolerant pass
  }

  let clean = ""
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    const next = raw[i + 1]
    if (lineComment) {
      if (ch === "\n") {
        lineComment = false
        clean += ch
      }
      continue
    }
    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false
        i += 1
      }
      continue
    }
    if (inString) {
      clean += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      clean += ch
      continue
    }
    if (ch === "/" && next === "/") {
      lineComment = true
      i += 1
      continue
    }
    if (ch === "/" && next === "*") {
      blockComment = true
      i += 1
      continue
    }
    clean += ch
  }

  let result = ""
  inString = false
  escaped = false
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i]
    if (inString) {
      result += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      continue
    }
    if (ch === ",") {
      let j = i + 1
      while (j < clean.length && /\s/.test(clean[j])) j += 1
      if (clean[j] === "}" || clean[j] === "]") continue
    }
    result += ch
  }
  try {
    return JSON.parse(result)
  } catch (error) {
    // Keep the engine's message (it usually includes the character position).
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

/** Parse config.json from the shell config ConfigMap, filling in all defaults. */
function parseShellConfig(raw: string | undefined, defaultImage: string, configMapRef: string): ShellOptions {
  const defaults: ShellOptions = {
    storageEnabled: false,
    storageSize: DEFAULT_WORKSPACE_SIZE,
    isolation: "gvisor",
    image: defaultImage,
  }
  if (!raw || !raw.trim()) return defaults

  const invalid = (detail: string) =>
    new Error(`Invalid ${CONFIG_MAP_KEY} in ConfigMap ${configMapRef}: ${detail}`)

  let parsed: unknown
  try {
    parsed = parseConfigJson(raw.replace(/^\uFEFF/, ""))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const preview = raw.replace(/\s+/g, " ").trim().slice(0, 240)
    throw invalid(`${detail}. Content: ${preview}`)
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("top level must be a JSON object")
  }

  const config = parsed as Record<string, unknown>
  if (config.storage !== undefined && (typeof config.storage !== "object" || config.storage === null || Array.isArray(config.storage))) {
    throw invalid("storage must be an object, for example {\"size\":\"1Gi\"}")
  }
  if (config.security !== undefined && (typeof config.security !== "object" || config.security === null || Array.isArray(config.security))) {
    throw invalid("security must be an object, for example {\"isolation\":\"gvisor\"}")
  }
  const storage = (config.storage ?? {}) as Record<string, unknown>
  const security = (config.security ?? {}) as Record<string, unknown>

  if (storage.size !== undefined && typeof storage.size !== "string") {
    throw invalid("storage.size must be a string containing a Kubernetes quantity, e.g. \"1Gi\"")
  }
  if (storage.class !== undefined && typeof storage.class !== "string") {
    throw invalid("storage.class must be a string naming an existing StorageClass")
  }

  // The presence of `storage` opts into a persistent workspace. Retention and
  // reclaim policy belong to the chosen StorageClass, not to the portal.
  const storageEnabled = config.storage !== undefined
  const size = typeof storage.size === "string" && storage.size.trim() ? storage.size.trim() : defaults.storageSize
  const storageClass = typeof storage.class === "string" && storage.class.trim() ? storage.class.trim() : undefined

  if (security.isolation !== undefined && typeof security.isolation !== "string") {
    throw invalid("security.isolation must be \"gvisor\" or \"usernamespace\"")
  }
  const isolationText = typeof security.isolation === "string" ? security.isolation.trim().toLowerCase() : ""
  if (isolationText && !["gvisor", "usernamespace", "userns"].includes(isolationText)) {
    throw invalid(`security.isolation "${security.isolation}" is invalid; expected "gvisor" or "usernamespace"`)
  }
  const isolation: Isolation = isolationText === "usernamespace" || isolationText === "userns"
    ? "usernamespace"
    : "gvisor"

  return { storageEnabled, storageSize: size, storageClass, isolation, image: defaultImage }
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

/**
 * The workspace claim is created by the portal, not by the Sandbox controller,
 * so it is not owned by the Sandbox and survives its deletion. The StorageClass
 * (and therefore the reclaim policy) is chosen by the admin via config.json;
 * omitting `class` uses the cluster's default StorageClass.
 */
async function ensureWorkspacePVC(
  base: string,
  token: string,
  dns: string,
  name: string,
  options: ShellOptions,
): Promise<void> {
  const url = `${base}/api/v1/namespaces/${SANDBOX_NAMESPACE}/persistentvolumeclaims/${name}`
  try {
    await requestJson(url, token, dns)
    return
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("GET 404")) throw error
  }

  try {
    await requestJson(`${base}/api/v1/namespaces/${SANDBOX_NAMESPACE}/persistentvolumeclaims`, token, dns, {
      method: "POST",
      body: JSON.stringify({
        apiVersion: "v1",
        kind: "PersistentVolumeClaim",
        metadata: {
          name,
          namespace: SANDBOX_NAMESPACE,
          annotations: { [OWNER_ANNOTATION]: name.slice(SANDBOX_NAME_PREFIX.length) },
        },
        spec: {
          accessModes: ["ReadWriteOnce"],
          ...(options.storageClass ? { storageClassName: options.storageClass } : {}),
          resources: { requests: { storage: options.storageSize } },
        },
      }),
    })
  } catch (error) {
    // Another tab may have created it between GET and POST.
    if (!(error instanceof Error) || !error.message.startsWith("POST 409")) throw error
  }
}

/**
 * ReadWriteOnce means a second Pod cannot mount the workspace while the old
 * sandbox Pod is still terminating. Wait for it to disappear before creating a
 * new Sandbox so exactly one shell Pod ever mounts the volume.
 */
async function waitForWorkspaceFree(
  base: string,
  token: string,
  dns: string,
  claimName: string,
  isAborted: () => boolean,
): Promise<void> {
  const url = `${base}/api/v1/namespaces/${SANDBOX_NAMESPACE}/pods`
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (isAborted()) throw new Error("Sandbox startup cancelled")
    const list = await requestJson(url, token, dns)
    const pods = (list.items ?? []) as Record<string, unknown>[]
    const isMounted = pods.some((pod) => {
      const spec = pod.spec as Record<string, unknown> | undefined
      const volumes = spec?.volumes as Record<string, unknown>[] | undefined
      const metadata = pod.metadata as Record<string, unknown> | undefined
      const terminating = !!metadata?.deletionTimestamp
      const mounted = volumes?.some(
        (volume) => (volume.persistentVolumeClaim as Record<string, unknown> | undefined)?.claimName === claimName,
      )
      return !!mounted && !terminating
    })
    if (!isMounted) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Workspace ${claimName} is still mounted by another Pod`)
}

/** Reads config.json from shell-config-<subject> in agent-sandbox; 404 means defaults. */
async function readShellOptions(
  base: string,
  token: string,
  dns: string,
  suffix: string,
  defaultImage: string,
): Promise<ShellOptions> {
  let data: Record<string, unknown> = {}
  const url = `${base}/api/v1/namespaces/${SANDBOX_NAMESPACE}/configmaps/${CONFIG_MAP_PREFIX}${suffix}`
  try {
    const configMap = await requestJson(url, token, dns)
    data = (configMap.data as Record<string, unknown>) ?? {}
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("GET 404")) throw error
  }

  const raw = typeof data[CONFIG_MAP_KEY] === "string" ? data[CONFIG_MAP_KEY] as string : undefined
  return parseShellConfig(raw, defaultImage, `${SANDBOX_NAMESPACE}/${CONFIG_MAP_PREFIX}${suffix}`)
}

/** Pod-template settings go into an annotation so config edits recreate the Sandbox. */
function configFingerprint(options: ShellOptions): string {
  const input = JSON.stringify([options.storageEnabled, options.isolation, options.image])
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
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

function sandboxUrl(lease: SandboxLease): string {
  return `${lease.base}/apis/${SANDBOX_API}/namespaces/${lease.handle.namespace}/${SANDBOX_RESOURCE}/${lease.handle.name}`
}

async function renewLease(): Promise<void> {
  if (!activeLease) return
  const token = useAuthStore.getState().accessToken
  if (!token) return
  await fetch(sandboxUrl(activeLease), {
    method: "PATCH",
    cache: "no-store",
    headers: {
      ...getHeaders(token, activeLease.dns),
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
  await deleteResource(sandboxUrl(lease), token, lease.dns).catch(() => {})
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
    if (ready?.status === "False" && ["InvalidConfiguration", "PodFailed", "PodSucceeded"].includes(String(ready.reason))) {
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
  suffix: string,
  options: ShellOptions,
  isAborted: () => boolean,
): Promise<SandboxHandle> {
  const sandboxUrl = `${base}/apis/${SANDBOX_API}/namespaces/${SANDBOX_NAMESPACE}/${SANDBOX_RESOURCE}/${name}`
  const fingerprint = configFingerprint(options)
  const lifecycle = { shutdownTime: shutdownTime(), shutdownPolicy: "Delete" }

  // Re-open the same per-user Sandbox when the dock is remounted.
  try {
    const sandbox = await requestJson(sandboxUrl, token, dns)
    const metadata = sandbox.metadata as Record<string, unknown> | undefined
    const annotations = metadata?.annotations as Record<string, unknown> | undefined
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

    // Pod templates are immutable once the controller has created the Pod.
    // Replace the Sandbox when its settings changed, or when it predates the
    // per-user/config-hash layout.
    if (!runsAsRoot || annotations?.[CONFIG_FINGERPRINT_ANNOTATION] !== fingerprint) {
      await deleteResource(sandboxUrl, token, dns)
    } else {
      await requestJson(sandboxUrl, token, dns, {
        method: "PATCH",
        body: JSON.stringify({
          spec: { ...lifecycle, operatingMode: "Running" },
        }),
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

  const podSpec: Record<string, unknown> = {
    ...(options.isolation === "gvisor"
      ? { runtimeClassName: SANDBOX_RUNTIME_CLASS }
      : // Linux user namespaces map container root to an unprivileged host UID.
        { hostUsers: false }),
    automountServiceAccountToken: false,
    containers: [{
      name: "sandboxd",
      image: options.image,
      imagePullPolicy: "IfNotPresent",
      env: [
        { name: "HOME", value: "/workspace" },
        { name: "PS1", value: "sandbox:\\w\\$ " },
      ],
      ports: [{ containerPort: 8080, protocol: "TCP" }, { containerPort: 9090, protocol: "TCP" }],
      readinessProbe: { httpGet: { path: "/v1/health", port: 8080 } },
      resources: { requests: { cpu: "250m", "ephemeral-storage": "1Gi", memory: "512Mi" } },
      securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] }, runAsGroup: 0, runAsNonRoot: false, runAsUser: 0 },
      volumeMounts: [
        { name: WORKSPACE_VOLUME, mountPath: "/workspace" },
        { name: "satoken", mountPath: "/var/run/secrets/kubernetes.io/serviceaccount" },
        { name: "ca-crt", mountPath: "/tmp/sa-ca", readOnly: true },
      ],
    }],
    restartPolicy: "OnFailure",
    securityContext: { fsGroup: 0, runAsNonRoot: false, runAsUser: 0, runAsGroup: 0 },
    volumes: [
      {
        name: WORKSPACE_VOLUME,
        // The PVC is created and owned by the portal (not by the Sandbox), so
        // it is never garbage-collected with the Sandbox. Only this Sandbox's
        // Pod mounts it, and waitForWorkspaceFree guards against overlap.
        ...(options.storageEnabled
          ? { persistentVolumeClaim: { claimName: name } }
          : { emptyDir: {} }),
      },
      { name: "satoken", emptyDir: {} },
      { name: "ca-crt", configMap: { name: "kube-root-ca.crt" } },
    ],
  }
  if (options.storageEnabled) {
    await waitForWorkspaceFree(base, token, dns, name, isAborted)
  }
  const sandboxCollectionUrl = `${base}/apis/${SANDBOX_API}/namespaces/${SANDBOX_NAMESPACE}/${SANDBOX_RESOURCE}`
  try {
    await requestJson(sandboxCollectionUrl, token, dns, {
      method: "POST",
      body: JSON.stringify({
        apiVersion: SANDBOX_API,
        kind: "Sandbox",
        metadata: {
          name,
          namespace: SANDBOX_NAMESPACE,
          annotations: {
            [CONFIG_FINGERPRINT_ANNOTATION]: fingerprint,
            [OWNER_ANNOTATION]: suffix,
          },
        },
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
      const dns = cluster.status.publicDns
      const suffix = subjectSuffix()
      await ensureSandboxNamespace(base, token, dns)
      const appConfig = await getConfig()
      const defaultImage = appConfig.webShellConfig?.sandboxImage ?? DEFAULT_SANDBOX_IMAGE
      const options = await readShellOptions(base, token, dns, suffix, defaultImage)
      const name = `${SANDBOX_NAME_PREFIX}${suffix}`

      if (options.isolation === "gvisor") await ensureSandboxRuntimeClass(base, token, dns)
      if (options.storageEnabled) {
        await ensureWorkspacePVC(base, token, dns, name, options)
      }

      setState((s) => ({ ...s, phase: "creating" }))
      const handle = await createSandbox(base, token, dns, name, suffix, options, () => abortRef.current)
      handleRef.current = handle
      if (abortRef.current) return
      startLease(handle, base, dns)
      setState({ phase: "ready", error: null, podName: handle.podName, namespace: handle.namespace })
      void injectShellCredentials(
        base,
        dns,
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
