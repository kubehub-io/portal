"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useClusterStore } from "@/stores/cluster-store"
import { useQueryClient } from "@tanstack/react-query"
import { applyK8sResource, getK8sResource, type ResourceDescriptor } from "@/lib/api/k8s-client"
import { useState, useRef, useCallback } from "react"
import { Upload, Link, Loader2, CheckCircle, XCircle, FileText, Circle } from "lucide-react"
import * as yaml from "js-yaml"
import { YamlEditor } from "@/components/yaml/yaml-editor"
import { useAPIDiscovery, resolveResourceFromDiscovery } from "@/hooks/use-api-discovery"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ApplyResult {
  name: string
  kind: string
  namespace: string
  action: "created" | "updated" | "unchanged" | "error"
  error?: string
}

function parseYAMLResource(doc: unknown): { apiVersion: string; kind: string; name: string; namespace: string } {
  const obj = doc as Record<string, unknown>
  const meta = obj.metadata as Record<string, unknown> | undefined
  if (!obj.apiVersion || !obj.kind || !meta?.name) {
    throw new Error("Missing required fields: apiVersion, kind, metadata.name")
  }
  return {
    apiVersion: obj.apiVersion as string,
    kind: obj.kind as string,
    name: meta.name as string,
    namespace: (meta.namespace as string) ?? "",
  }
}

function resolveResourceDescriptor(apiVersion: string, kind: string): ResourceDescriptor {
  const slashIdx = apiVersion.indexOf("/")
  if (slashIdx === -1) {
    return { version: apiVersion, resource: `${kind.toLowerCase()}s` }
  }
  return {
    group: apiVersion.slice(0, slashIdx),
    version: apiVersion.slice(slashIdx + 1),
    resource: `${kind.toLowerCase()}s`,
  }
}

const SERVER_OWNED_METADATA = new Set([
  "creationTimestamp",
  "deletionGracePeriodSeconds",
  "deletionTimestamp",
  "generation",
  "managedFields",
  "resourceVersion",
  "uid",
])

function comparableManifest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableManifest)
  if (!value || typeof value !== "object") return value

  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(source)) {
    if (key === "status") continue
    if (key === "metadata" && child && typeof child === "object") {
      const metadata: Record<string, unknown> = {}
      for (const [metadataKey, metadataValue] of Object.entries(child as Record<string, unknown>)) {
        if (!SERVER_OWNED_METADATA.has(metadataKey)) metadata[metadataKey] = comparableManifest(metadataValue)
      }
      result[key] = metadata
    } else {
      result[key] = comparableManifest(child)
    }
  }
  return result
}

/** True when every field supplied by the manifest already matches live state. */
function manifestMatchesLive(live: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) {
    return Array.isArray(live) && JSON.stringify(live) === JSON.stringify(desired)
  }
  if (desired && typeof desired === "object") {
    if (!live || typeof live !== "object" || Array.isArray(live)) return false
    return Object.entries(desired as Record<string, unknown>).every(([key, value]) =>
      manifestMatchesLive((live as Record<string, unknown>)[key], value),
    )
  }
  return live === desired
}

export function ApplyPanel({ embedded = false }: { embedded?: boolean }) {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const clusterDns = activeCluster?.status.publicDns
  const discoveryQuery = useAPIDiscovery()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [yamlInput, setYamlInput] = useState("")
  const [urlInput, setUrlInput] = useState("")
  const [results, setResults] = useState<ApplyResult[]>([])
  const [applying, setApplying] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [error, setError] = useState("")
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"editor" | "url">("editor")

  const handleEditorChange = useCallback((next: string) => {
    setYamlInput(next)
    if (yamlError) {
      try {
        yaml.loadAll(next)
        setYamlError(null)
      } catch {
        /* keep error */
      }
    }
  }, [yamlError])

  async function applyYAML(yamlStr: string) {
    setError("")
    setResults([])
    setApplying(true)

    try {
      const docs = yaml.loadAll(yamlStr)
      const res: ApplyResult[] = []
      const discovery = discoveryQuery.data

      for (const doc of docs) {
        if (!doc) continue
        try {
          const info = parseYAMLResource(doc)
          const desc = resolveResourceFromDiscovery(info.apiVersion, info.kind, discovery)
            ?? resolveResourceDescriptor(info.apiVersion, info.kind)
          const ns = info.namespace || null
          const name = info.name

          // Probed only to report whether the resource was created or updated;
          // server-side apply decides that itself.
          let exists = false
          let unchanged = false
          try {
            const live = await getK8sResource(activeCluster!, ns, desc, name)
            exists = true
            unchanged = manifestMatchesLive(
              comparableManifest(live),
              comparableManifest(doc),
            )
          } catch {
            exists = false
          }

          await applyK8sResource(activeCluster!, ns, desc, name, doc)
          queryClient.invalidateQueries({ queryKey: [desc.resource] })
          res.push({
            name: info.name,
            kind: info.kind,
            namespace: info.namespace,
            action: exists ? (unchanged ? "unchanged" : "updated") : "created",
          })
        } catch (e) {
          res.push({
            name: "",
            kind: "",
            namespace: "",
            action: "error",
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      setResults(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setYamlError(msg)
    } finally {
      setApplying(false)
    }
  }

  async function handleApply() {
    if (!clusterDns) return
    await applyYAML(yamlInput)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setYamlInput(text)
    setActiveTab("editor")
  }

  async function handleFetchURL() {
    if (!urlInput) return
    setFetchingUrl(true)
    setError("")
    try {
      const res = await fetch(urlInput)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const text = await res.text()
      setYamlInput(text)
      setActiveTab("editor")
    } catch (e) {
      setError(`Failed to fetch URL: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setFetchingUrl(false)
    }
  }

  const actionIcons: Record<string, React.ReactNode> = {
    created: <CheckCircle className="h-4 w-4 text-green-500" />,
    updated: <CheckCircle className="h-4 w-4 text-blue-500" />,
    unchanged: <Circle className="h-4 w-4 text-muted-foreground" />,
    error: <XCircle className="h-4 w-4 text-destructive" />,
  }

  return (
    <div className={cn(embedded ? "space-y-3" : "space-y-6")}>
      {!embedded && (
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Apply YAML</h2>
          <p className="text-muted-foreground">
            {activeCluster ? `${activeCluster.metadata.name} / apply` : "No active cluster"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant={activeTab === "editor" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("editor")}
        >
          <FileText className="h-4 w-4" />
          Editor
        </Button>
        <Button
          variant={activeTab === "url" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("url")}
        >
          <Link className="h-4 w-4" />
          From URL
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload YAML
          </Button>
        </div>
      </div>

      {activeTab === "url" && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="https://raw.githubusercontent.com/.../manifest.yaml"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={handleFetchURL} disabled={fetchingUrl || !urlInput}>
            {fetchingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
            Fetch
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <YamlEditor
          value={yamlInput}
          onChange={handleEditorChange}
          height={embedded ? "14rem" : "24rem"}
          resizable
        />
        {yamlError && (
          <p className="text-sm text-destructive">{yamlError}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleApply} disabled={applying || !yamlInput.trim() || !clusterDns || !!yamlError || discoveryQuery.isLoading}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {applying ? "Applying..." : "Apply"}
        </Button>

        {results.length > 0 && (
          <TooltipProvider delayDuration={200}>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {results.map((r, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        r.action === "error" ? "bg-destructive/10 text-destructive" : "bg-muted/60",
                      )}
                    >
                      {actionIcons[r.action]}
                      {r.action === "error" ? (
                        <span className="truncate">Error</span>
                      ) : (
                        <span className="truncate font-mono font-medium">
                          {r.kind}/{r.name}
                        </span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {r.action === "error" ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">Apply failed</div>
                        <div className="break-words">{r.error}</div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {r.action === "created"
                            ? "Created"
                            : r.action === "updated"
                              ? "Updated"
                              : "Unchanged"} {r.kind}/{r.name}
                        </div>
                        <div>Namespace: {r.namespace || "cluster-scoped"}</div>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {error && !yamlError && (
        <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}
