"use client"

import { useEffect, useMemo } from "react"
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react"
import {
  DEFAULT_AGENT_NAMESPACE,
  DEFAULT_AGENT_SERVICE_ACCOUNT,
  isDefaultAgentServiceAccount,
  type AgentServiceAccount,
} from "@/lib/api/agent-chat"
import {
  useK8sClusterResources,
  useK8sNamespaceResources,
} from "@/hooks/use-k8s-resources"
import type { K8sResource } from "@/lib/api/k8s-client"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const NAMESPACES_DESC = { version: "v1", resource: "namespaces" } as const
const SERVICE_ACCOUNTS_DESC = { version: "v1", resource: "serviceaccounts" } as const

const DEFAULT_TOOLTIP =
  "Chat agent will use this readonly account to troubleshoot/operate your cluster, no access to secrets."
const CUSTOM_TOOLTIP =
  "Chat Agent will use this account to troubleshoot/operate your cluster!"

interface AgentAccountPickerProps {
  value: AgentServiceAccount
  onChange: (value: AgentServiceAccount) => void
  disabled?: boolean
}

function sortDefaultFirst(defaultName: string) {
  return (a: string, b: string) => {
    if (a === defaultName) return -1
    if (b === defaultName) return 1
    return a.localeCompare(b)
  }
}

function namesOf(items: K8sResource[] | undefined): string[] {
  return (items ?? []).map((item) => item.metadata.name)
}

export function AgentAccountPicker({
  value,
  onChange,
  disabled = false,
}: AgentAccountPickerProps) {
  const { data: namespaceData, isLoading: namespacesLoading } =
    useK8sClusterResources<K8sResource>(NAMESPACES_DESC, "namespaces")
  const {
    data: serviceAccountData,
    isLoading: serviceAccountsLoading,
    isError: serviceAccountsError,
  } = useK8sNamespaceResources<K8sResource>(
    value.namespace,
    SERVICE_ACCOUNTS_DESC,
    "serviceaccounts",
  )

  const namespaces = useMemo(() => {
    const names = namesOf(namespaceData?.items)
    if (!names.includes(DEFAULT_AGENT_NAMESPACE)) names.push(DEFAULT_AGENT_NAMESPACE)
    return Array.from(new Set(names)).sort(sortDefaultFirst(DEFAULT_AGENT_NAMESPACE))
  }, [namespaceData])

  const serviceAccounts = useMemo(() => {
    const names = new Set(namesOf(serviceAccountData?.items))
    if (value.namespace === DEFAULT_AGENT_NAMESPACE) {
      names.add(DEFAULT_AGENT_SERVICE_ACCOUNT)
    }
    // Keep a previously picked account visible while the new list loads.
    if (value.serviceAccount) names.add(value.serviceAccount)
    return Array.from(names).sort(sortDefaultFirst(DEFAULT_AGENT_SERVICE_ACCOUNT))
  }, [serviceAccountData, value.namespace, value.serviceAccount])

  // A non-default namespace starts empty; once its accounts load, pick the
  // first one so the composer never sends a half-filled account reference.
  useEffect(() => {
    if (value.serviceAccount || serviceAccountsLoading) return
    const next = serviceAccounts[0]
    if (next) onChange({ ...value, serviceAccount: next })
  }, [value, serviceAccounts, serviceAccountsLoading, onChange])

  const isDefault = isDefaultAgentServiceAccount(value)

  const handleNamespaceChange = (namespace: string) => {
    onChange({
      namespace,
      serviceAccount:
        namespace === DEFAULT_AGENT_NAMESPACE ? DEFAULT_AGENT_SERVICE_ACCOUNT : "",
    })
  }

  const handleServiceAccountChange = (serviceAccount: string) => {
    onChange({ ...value, serviceAccount })
  }

  const resetToDefault = () => {
    onChange({
      namespace: DEFAULT_AGENT_NAMESPACE,
      serviceAccount: DEFAULT_AGENT_SERVICE_ACCOUNT,
    })
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
      <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">
        Agent account
      </span>

      <Select
        value={value.namespace}
        onValueChange={handleNamespaceChange}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label="Agent service account namespace"
          className="h-7 w-[150px] border-dashed px-2 text-xs"
        >
          <SelectValue placeholder={namespacesLoading ? "Loading…" : "Namespace"} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {namespaces.map((namespace) => (
            <SelectItem key={namespace} value={namespace} className="text-xs">
              {namespace}
              {namespace === DEFAULT_AGENT_NAMESPACE && (
                <span className="ml-1 text-muted-foreground">(default)</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-[11px] text-muted-foreground">/</span>

      <Select
        value={value.serviceAccount}
        onValueChange={handleServiceAccountChange}
        disabled={disabled || serviceAccountsLoading || serviceAccounts.length === 0}
      >
        <SelectTrigger
          aria-label="Agent service account"
          className="h-7 w-[190px] border-dashed px-2 text-xs"
        >
          <SelectValue
            placeholder={
              serviceAccountsLoading ? "Loading…" : "Select service account"
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {serviceAccounts.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              {serviceAccountsError
                ? "Could not list service accounts"
                : "No service accounts found"}
            </div>
          ) : (
            serviceAccounts.map((serviceAccount) => (
              <SelectItem
                key={serviceAccount}
                value={serviceAccount}
                className="text-xs"
              >
                {serviceAccount}
                {value.namespace === DEFAULT_AGENT_NAMESPACE &&
                  serviceAccount === DEFAULT_AGENT_SERVICE_ACCOUNT && (
                    <span className="ml-1 text-muted-foreground">(readonly)</span>
                  )}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={
                isDefault
                  ? "Readonly agent service account"
                  : "Warning: agent service account has cluster access"
              }
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                isDefault
                  ? "text-muted-foreground hover:bg-accent"
                  : "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400",
              )}
            >
              {isDefault ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {isDefault ? DEFAULT_TOOLTIP : CUSTOM_TOOLTIP}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {!isDefault && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={resetToDefault}
          disabled={disabled}
        >
          <RotateCcw className="h-3 w-3" />
          Use default
        </Button>
      )}
    </div>
  )
}
