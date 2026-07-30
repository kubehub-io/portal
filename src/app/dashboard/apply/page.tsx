"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useClusterStore } from "@/stores/cluster-store"
import { getK8sResource, createK8sResource, updateK8sResource, type ResourceDescriptor } from "@/lib/api/k8s-client"
import { useState, useRef } from "react"
import { Upload, Link, Loader2, CheckCircle, XCircle, FileText } from "lucide-react"
import * as yaml from "js-yaml"

interface ApplyResult {
  name: string
  kind: string
  namespace: string
  action: "created" | "updated" | "error"
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

export default function ApplyPage() {
  const activeCluster = useClusterStore((s) => s.activeCluster)
  const clusterDns = activeCluster?.status.publicDns
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [yamlInput, setYamlInput] = useState("")
  const [urlInput, setUrlInput] = useState("")
  const [results, setResults] = useState<ApplyResult[]>([])
  const [applying, setApplying] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<"editor" | "url">("editor")

  async function applyYAML(yamlStr: string) {
    setError("")
    setResults([])
    setApplying(true)

    try {
      const docs = yaml.loadAll(yamlStr)
      const res: ApplyResult[] = []

      for (const doc of docs) {
        if (!doc) continue
        try {
          const info = parseYAMLResource(doc)
          const desc = resolveResourceDescriptor(info.apiVersion, info.kind)
          const ns = info.namespace || null
          const name = info.name

          let exists = false
          try {
            await getK8sResource(clusterDns!, ns, desc, name)
            exists = true
          } catch {
            exists = false
          }

          if (exists) {
            await updateK8sResource(clusterDns!, ns, desc, name, doc)
            res.push({ name: info.name, kind: info.kind, namespace: info.namespace, action: "updated" })
          } else {
            await createK8sResource(clusterDns!, ns, desc, doc)
            res.push({ name: info.name, kind: info.kind, namespace: info.namespace, action: "created" })
          }
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
      setError(e instanceof Error ? e.message : String(e))
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
    error: <XCircle className="h-4 w-4 text-destructive" />,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Apply YAML</h2>
        <p className="text-muted-foreground">
          {activeCluster ? `${activeCluster.metadata.name} / apply` : "No active cluster"}
        </p>
      </div>

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
        <textarea
          className="w-full h-80 rounded-md border bg-muted p-4 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Paste your YAML here..."
          value={yamlInput}
          onChange={(e) => setYamlInput(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleApply} disabled={applying || !yamlInput.trim() || !clusterDns}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {applying ? "Applying..." : "Apply"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-md border">
          <div className="p-3 text-sm font-medium border-b">Results</div>
          <div className="divide-y">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-3 text-sm">
                {actionIcons[r.action]}
                {r.action === "error" ? (
                  <span className="text-destructive">{r.error}</span>
                ) : (
                  <span>
                    {r.action === "created" ? "Created" : "Updated"}{" "}
                    <span className="font-medium">{r.kind}</span>{" "}
                    <code className="rounded bg-muted px-1">{r.name}</code>
                    {r.namespace && (
                      <>
                        {" "}in namespace <code className="rounded bg-muted px-1">{r.namespace}</code>
                      </>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
