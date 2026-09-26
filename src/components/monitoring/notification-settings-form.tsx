"use client"

import { useCallback, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAlertmanagerConfig, useSaveAlertmanagerConfig } from "@/hooks/use-monitoring"
import {
  DEFAULT_ROUTE,
  RECEIVER_TYPES,
  emptyReceiver,
  formatGroupBy,
  getReceiverConfigs,
  normalizeConfig,
  parseGroupBy,
  receiverTypeLabel,
  receiverTypes,
  sanitizeConfig,
  uniqueReceiverName,
  validateConfig,
  withReceiverConfigs,
  type ConfigErrors,
  type ReceiverType,
} from "@/lib/monitoring/alertmanager"
import type { AlertmanagerConfig, AlertmanagerReceiver, AlertmanagerRoute } from "@/lib/api/monitoring"
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Entry = Record<string, unknown>

// ── small form primitives ────────────────────────────────

function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return <p className="mt-1 text-xs text-destructive">{children}</p>
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  hint,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  error?: string
  hint?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        className="mt-1 h-8"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <FieldError>{error}</FieldError> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} className="mt-0.5" checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  )
}

// ── dedicated receiver layouts ───────────────────────────

type EntryProps = {
  value: Entry
  onChange: (next: Entry) => void
  errors: ConfigErrors
  errorBase: string
}

function MSTeamsLayout({ value, onChange, errors, errorBase }: EntryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        className="sm:col-span-2"
        label="Webhook URL"
        type="url"
        placeholder="https://outlook.office.com/webhook/..."
        value={(value.webhook_url as string) ?? ""}
        onChange={(v) => onChange({ ...value, webhook_url: v })}
        error={errors[`${errorBase}.webhook_url`]}
      />
      <ToggleField
        label="Send resolved notifications"
        hint="Notify when an alert is no longer firing"
        checked={value.send_resolved === true}
        onChange={(v) => onChange({ ...value, send_resolved: v })}
      />
    </div>
  )
}

function TelegramLayout({ value, onChange, errors, errorBase }: EntryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Bot token"
        type="password"
        placeholder="123456789:AA..."
        value={(value.bot_token as string) ?? ""}
        onChange={(v) => onChange({ ...value, bot_token: v })}
        error={errors[`${errorBase}.bot_token`]}
        hint="Issued by @BotFather"
      />
      <TextField
        label="Chat ID"
        type="number"
        placeholder="-1001234567890"
        value={value.chat_id === undefined || value.chat_id === null ? "" : String(value.chat_id)}
        onChange={(v) => {
          const parsed = Number.parseInt(v, 10)
          onChange({ ...value, chat_id: Number.isNaN(parsed) ? undefined : parsed })
        }}
        error={errors[`${errorBase}.chat_id`]}
        hint="Target chat, group or channel"
      />
      <ToggleField
        label="Send resolved notifications"
        checked={value.send_resolved === true}
        onChange={(v) => onChange({ ...value, send_resolved: v })}
      />
      <ToggleField
        label="Disable notifications"
        hint="Keep the receiver configured but silent"
        checked={value.disable_notifications === true}
        onChange={(v) => onChange({ ...value, disable_notifications: v })}
      />
    </div>
  )
}

function EmailLayout({ value, onChange, errors, errorBase }: EntryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Email address"
        type="email"
        placeholder="oncall@example.com"
        value={(value.to as string) ?? ""}
        onChange={(v) => onChange({ ...value, to: v })}
        error={errors[`${errorBase}.to`]}
      />
      <div className="flex flex-col justify-end gap-2 pb-1">
        <ToggleField
          label="Require TLS"
          hint="Reject delivery over plaintext SMTP"
          checked={value.require_tls === true}
          onChange={(v) => onChange({ ...value, require_tls: v })}
        />
        <ToggleField
          label="Send resolved notifications"
          checked={value.send_resolved === true}
          onChange={(v) => onChange({ ...value, send_resolved: v })}
        />
      </div>
    </div>
  )
}

function WebhookLayout({ value, onChange, errors, errorBase }: EntryProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        className="sm:col-span-2"
        label="URL"
        type="url"
        placeholder="https://example.com/hooks/alertmanager"
        value={(value.url as string) ?? ""}
        onChange={(v) => onChange({ ...value, url: v })}
        error={errors[`${errorBase}.url`]}
      />
      <TextField
        label="Max alerts"
        type="number"
        placeholder="0 (no limit)"
        value={value.max_alerts === undefined || value.max_alerts === null ? "" : String(value.max_alerts)}
        onChange={(v) => {
          const parsed = Number.parseInt(v, 10)
          onChange({ ...value, max_alerts: Number.isNaN(parsed) ? undefined : parsed })
        }}
        error={errors[`${errorBase}.max_alerts`]}
        hint="Maximum alerts sent per webhook call"
      />
      <div className="flex items-end pb-1">
        <ToggleField
          label="Send resolved notifications"
          checked={value.send_resolved === true}
          onChange={(v) => onChange({ ...value, send_resolved: v })}
        />
      </div>
    </div>
  )
}

const RECEIVER_LAYOUTS: Record<ReceiverType, (props: EntryProps) => React.ReactElement> = {
  msteams: MSTeamsLayout,
  telegram: TelegramLayout,
  email: EmailLayout,
  webhook: WebhookLayout,
}

const RECEIVER_ICONS: Record<ReceiverType, React.ReactNode> = {
  msteams: <Badge variant="info">Teams</Badge>,
  telegram: <Badge variant="info">Telegram</Badge>,
  email: <Badge variant="info">Email</Badge>,
  webhook: <Badge variant="info">Webhook</Badge>,
}

// ── receiver card ────────────────────────────────────────

function ReceiverCard({
  receiver,
  index,
  errors,
  onChange,
  onRemove,
}: {
  receiver: AlertmanagerReceiver
  index: number
  errors: ConfigErrors
  onChange: (next: AlertmanagerReceiver) => void
  onRemove: () => void
}) {
  const types = receiverTypes(receiver)
  const receiverError = errors[`receivers.${index}.name`]

  const patchType = (type: ReceiverType, configs: Entry[]) => {
    onChange(withReceiverConfigs(receiver, type, configs))
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-start gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Input
              className="h-8 max-w-xs"
              placeholder="receiver name"
              value={receiver.name ?? ""}
              onChange={(e) => onChange({ ...receiver, name: e.target.value })}
            />
            <Badge variant="secondary">{types.length ? types.map(receiverTypeLabel).join(", ") : "unset"}</Badge>
          </div>
          <FieldError>{receiverError ?? errors[`receivers.${index}.type`]}</FieldError>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onRemove} title="Remove receiver">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-4 p-3">
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receiver type selected yet.</p>
        ) : null}

        {types.map((type) => {
          const Layout = RECEIVER_LAYOUTS[type]
          const configs = getReceiverConfigs<Entry>(receiver, type)
          return (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2">
                {RECEIVER_ICONS[type]}
                <span className="text-sm font-medium">{receiverTypeLabel(type)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={() => patchType(type, [...configs, {}])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              {configs.map((entry, entryIndex) => (
                <div key={entryIndex} className="relative rounded-md border bg-background p-3">
                  {configs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1 h-6 w-6 text-muted-foreground"
                      title="Remove"
                      onClick={() => patchType(type, configs.filter((_, i) => i !== entryIndex))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Layout
                    value={entry}
                    onChange={(next) => patchType(type, configs.map((c, i) => (i === entryIndex ? next : c)))}
                    errors={errors}
                    errorBase={`receivers.${index}.${type}.${entryIndex}`}
                  />
                </div>
              ))}
            </div>
          )
        })}

        {types.length > 0 ? (
          <AddReceiverTypeMenu
            existing={types}
            onAdd={(type) => patchType(type, [...getReceiverConfigs<Entry>(receiver, type), {}])}
          />
        ) : null}
      </div>
    </div>
  )
}

function AddReceiverTypeMenu({
  existing,
  onAdd,
}: {
  existing: ReceiverType[]
  onAdd: (type: ReceiverType) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-xs text-muted-foreground">Also notify via</span>
      {RECEIVER_TYPES.filter((t) => !existing.includes(t.id)).map((t) => (
        <Button key={t.id} variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAdd(t.id)}>
          <Plus className="h-3.5 w-3.5" />
          {t.label}
        </Button>
      ))}
      {existing.length === RECEIVER_TYPES.length && (
        <span className="text-xs text-muted-foreground">All receiver types are configured.</span>
      )}
    </div>
  )
}

// ── form ─────────────────────────────────────────────────

export function NotificationSettingsForm({ name }: { name: string }) {
  const query = useAlertmanagerConfig(name)

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-md border py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
        Failed to load notification settings: {query.error?.message ?? "no data"}
      </div>
    )
  }

  // Keyed on the fetched version so a refetch (including the one after a save)
  // resets the draft instead of needing an effect to push data into state.
  return (
    <ConfigEditor
      key={query.dataUpdatedAt}
      name={name}
      initial={query.data.data}
      etag={query.data.etag}
      onSaved={query.refetch}
    />
  )
}

function ConfigEditor({
  name,
  initial,
  etag,
  onSaved,
}: {
  name: string
  initial: AlertmanagerConfig
  etag?: string
  onSaved: () => void
}) {
  const save = useSaveAlertmanagerConfig()
  const [draft, setDraft] = useState<AlertmanagerConfig>(() => normalizeConfig(initial))
  const [errors, setErrors] = useState<ConfigErrors>({})
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [newType, setNewType] = useState<ReceiverType>("msteams")

  const update = useCallback((mutate: (current: AlertmanagerConfig) => AlertmanagerConfig) => {
    setDraft(mutate)
    setDirty(true)
    setMessage(null)
  }, [])

  const setRoute = useCallback(
    (patch: Partial<AlertmanagerRoute>) => update((c) => ({ ...c, route: { ...c.route, ...patch } })),
    [update],
  )

  const handleSave = () => {
    const config = sanitizeConfig(draft)
    const found = validateConfig(config)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setMessage("Fix the highlighted fields before saving")
      return
    }
    setMessage(null)
    save.mutate(
      { name, config, etag },
      {
        onSuccess: (result) => {
          setDirty(false)
          setMessage(result.data?.message ?? "Configuration saved")
          onSaved()
        },
      },
    )
  }

  const handleRevert = () => {
    setErrors({})
    setMessage(null)
    onSaved()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{name}</Badge>
        {etag && <span className="text-xs text-muted-foreground">etag {etag}</span>}
        {dirty && <span className="text-xs text-yellow-600 dark:text-yellow-500">unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          {(save.isError || message) && (
            <span className={cn("text-xs", save.isError ? "text-destructive" : "text-muted-foreground")}>
              {save.isError ? (save.error instanceof Error ? save.error.message : "Save failed") : message}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleRevert} disabled={save.isPending}>
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending || !dirty}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>

      <section className="space-y-3 rounded-md border p-4">
        <div>
          <h3 className="text-sm font-semibold">Route</h3>
          <p className="text-xs text-muted-foreground">How alerts are grouped and which receiver is notified first</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Receiver</Label>
            <Select
              value={draft.route.receiver ?? ""}
              onValueChange={(v) => setRoute({ receiver: v })}
            >
              <SelectTrigger className="mt-1 h-8">
                <SelectValue placeholder="No receiver" />
              </SelectTrigger>
              <SelectContent>
                {(draft.receivers ?? []).map((r, i) => (
                  <SelectItem key={i} value={r.name?.trim() || `receiver-${i + 1}`}>
                    {r.name?.trim() || `receiver-${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{errors["route.receiver"]}</FieldError>
          </div>
          <TextField
            label="Group by"
            placeholder="alertname, cluster"
            value={formatGroupBy(draft.route.group_by)}
            onChange={(v) => setRoute({ group_by: parseGroupBy(v) })}
            hint="Comma separated labels alerts are grouped by"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["group_wait", "Group wait", DEFAULT_ROUTE.group_wait],
              ["group_interval", "Group interval", DEFAULT_ROUTE.group_interval],
              ["repeat_interval", "Repeat interval", DEFAULT_ROUTE.repeat_interval],
            ] as const
          ).map(([field, label, placeholder]) => (
            <TextField
              key={field}
              label={label}
              placeholder={placeholder}
              value={draft.route[field] ?? ""}
              onChange={(v) => setRoute({ [field]: v })}
              error={errors[`route.${field}`]}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <h3 className="text-sm font-semibold">Receivers</h3>
            <p className="text-xs text-muted-foreground">Where notifications are delivered</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select value={newType} onValueChange={(v) => setNewType(v as ReceiverType)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIVER_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={() =>
                update((c) => {
                  const receivers = c.receivers ?? []
                  return {
                    ...c,
                    receivers: [...receivers, emptyReceiver(newType, uniqueReceiverName(receivers))],
                  }
                })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add receiver
            </Button>
          </div>
        </div>
        <FieldError>{errors.receivers}</FieldError>

        {(draft.receivers ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            No receivers yet. Add one to start receiving notifications.
          </div>
        ) : (
          <div className="space-y-3">
            {(draft.receivers ?? []).map((receiver, index) => (
              <ReceiverCard
                key={index}
                receiver={receiver}
                index={index}
                errors={errors}
                onChange={(next) =>
                  update((c) => ({
                    ...c,
                    receivers: (c.receivers ?? []).map((r, i) => (i === index ? next : r)),
                  }))
                }
                onRemove={() =>
                  update((c) => ({
                    ...c,
                    receivers: (c.receivers ?? []).filter((_, i) => i !== index),
                  }))
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
