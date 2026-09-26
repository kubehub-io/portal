"use client"

import { useCallback, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDeleteRules, useRules, useSaveRules } from "@/hooks/use-monitoring"
import {
  draftToRequest,
  emptyDraftGroup,
  emptyDraftRule,
  fromRows,
  sanitizeRequest,
  toDraft,
  toRows,
  validateRequest,
  type DraftGroup,
  type DraftRequest,
  type DraftRule,
  type KeyValueRow,
  type RulesErrors,
} from "@/lib/monitoring/rules"
import { DURATION_HINT } from "@/lib/monitoring/duration"
import type { CreateRuleRequest } from "@/lib/api/monitoring"
import { Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"

function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return <p className="mt-1 text-xs text-destructive">{children}</p>
}

function LabelledInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
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
        className="mt-1 h-8"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function KeyValueEditor({
  title,
  rows,
  onChange,
  error,
  placeholderKey,
  placeholderValue,
}: {
  title: string
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  error?: string
  placeholderKey?: string
  placeholderValue?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Badge variant="secondary" className="text-[10px]">
          {rows.length}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-1.5 text-xs"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No {title.toLowerCase()}.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                className="h-7 flex-1 font-mono text-xs"
                placeholder={placeholderKey ?? "key"}
                value={row.key}
                onChange={(e) => onChange(rows.map((r, j) => (i === j ? { ...r, key: e.target.value } : r)))}
              />
              <Input
                className="h-7 flex-[2] font-mono text-xs"
                placeholder={placeholderValue ?? "value"}
                value={row.value}
                onChange={(e) => onChange(rows.map((r, j) => (i === j ? { ...r, value: e.target.value } : r)))}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <FieldError>{error}</FieldError>
    </div>
  )
}

function RuleCard({
  rule,
  groupIndex,
  ruleIndex,
  errors,
  onChange,
  onRemove,
  canRemove,
}: {
  rule: DraftRule
  groupIndex: number
  ruleIndex: number
  errors: RulesErrors
  onChange: (next: DraftRule) => void
  onRemove: () => void
  canRemove: boolean
}) {
  // The card is keyed by rule id, so the rows never need re-syncing from props.
  const [labelRows, setLabelRows] = useState<KeyValueRow[]>(() => toRows(rule.labels))
  const [annotationRows, setAnnotationRows] = useState<KeyValueRow[]>(() => toRows(rule.annotations))
  const base = `groups.${groupIndex}.rules.${ruleIndex}`

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Rule {ruleIndex + 1}</span>
        <Badge variant={rule.alert?.trim() ? "info" : "secondary"}>
          {rule.alert?.trim() ? "alerting" : "recording"}
        </Badge>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-muted-foreground"
            title="Remove rule"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LabelledInput
          label="Alert name"
          placeholder="leave empty for a recording rule"
          value={rule.alert ?? ""}
          onChange={(v) => onChange({ ...rule, alert: v })}
          error={errors[`${base}.alert`]}
        />
        <LabelledInput
          label="For"
          placeholder="5m"
          value={rule.for ?? ""}
          onChange={(v) => onChange({ ...rule, for: v })}
          error={errors[`${base}.for`]}
          hint={DURATION_HINT}
        />
        <div className="sm:col-span-2">
          <Label className="text-xs text-muted-foreground">Expression</Label>
          <Textarea
            className="mt-1 min-h-[70px] font-mono text-xs"
            placeholder="up == 0"
            value={rule.expr ?? ""}
            onChange={(e) => onChange({ ...rule, expr: e.target.value })}
          />
          <FieldError>{errors[`${base}.expr`]}</FieldError>
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <KeyValueEditor
          title="Labels"
          rows={labelRows}
          onChange={(rows) => {
            setLabelRows(rows)
            onChange({ ...rule, labels: fromRows(rows) })
          }}
          error={errors[`${base}.labels`]}
          placeholderKey="severity"
          placeholderValue="critical"
        />
        <KeyValueEditor
          title="Annotations"
          rows={annotationRows}
          onChange={(rows) => {
            setAnnotationRows(rows)
            onChange({ ...rule, annotations: fromRows(rows) })
          }}
          error={errors[`${base}.annotations`]}
          placeholderKey="summary"
          placeholderValue="Instance down"
        />
      </div>
    </div>
  )
}

function GroupCard({
  group,
  index,
  errors,
  onChange,
  onRemove,
}: {
  group: DraftGroup
  index: number
  errors: RulesErrors
  onChange: (next: DraftGroup) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-end gap-3 border-b bg-muted/40 px-3 py-2">
        <LabelledInput
          className="w-64"
          label="Group name"
          value={group.name ?? ""}
          onChange={(v) => onChange({ ...group, name: v })}
          error={errors[`groups.${index}.name`]}
        />
        <LabelledInput
          className="w-40"
          label="Interval"
          placeholder="30s"
          value={group.interval ?? ""}
          onChange={(v) => onChange({ ...group, interval: v })}
          error={errors[`groups.${index}.interval`]}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChange({ ...group, rules: [...group.rules, emptyDraftRule()] })}
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            title="Remove group"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-3 p-3">
        <FieldError>{errors[`groups.${index}.rules`]}</FieldError>
        {group.rules.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No rules in this group.
          </p>
        ) : (
          group.rules.map((rule, ri) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              groupIndex={index}
              ruleIndex={ri}
              errors={errors}
              canRemove={group.rules.length > 1}
              onChange={(next) => onChange({ ...group, rules: group.rules.map((r, i) => (i === ri ? next : r)) })}
              onRemove={() => onChange({ ...group, rules: group.rules.filter((_, i) => i !== ri) })}
            />
          ))
        )}
      </div>
    </div>
  )
}

export function RulesEditor({ namespace, onDeleted }: { namespace: string; onDeleted?: () => void }) {
  const query = useRules(namespace)

  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
        Failed to load rules: {query.error.message}
      </div>
    )
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="flex items-center justify-center rounded-md border py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Keyed on the fetched version so a refetch (including the one after a save)
  // resets the draft instead of needing an effect to push data into state.
  return (
    <NamespaceEditor
      key={query.dataUpdatedAt}
      namespace={namespace}
      initial={query.data.data}
      etag={query.data.etag}
      onReloaded={query.refetch}
      onDeleted={onDeleted}
    />
  )
}

function NamespaceEditor({
  namespace,
  initial,
  etag,
  onReloaded,
  onDeleted,
}: {
  namespace: string
  initial: CreateRuleRequest
  etag?: string
  onReloaded: () => void
  onDeleted?: () => void
}) {
  const save = useSaveRules()
  const remove = useDeleteRules()
  const [draft, setDraft] = useState<DraftRequest>(() => toDraft(initial))
  const [errors, setErrors] = useState<RulesErrors>({})
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = useCallback((mutate: (current: DraftRequest) => DraftRequest) => {
    setDraft(mutate)
    setDirty(true)
    setMessage(null)
  }, [])

  const handleSave = () => {
    const request = sanitizeRequest(draftToRequest(draft), namespace)
    const found = validateRequest(request)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setMessage("Fix the highlighted fields before saving")
      return
    }
    setMessage(null)
    save.mutate(
      { namespace, rules: request, etag },
      {
        onSuccess: (result) => {
          setDirty(false)
          setMessage(result.data?.message ?? "Rules saved")
          onReloaded()
        },
      },
    )
  }

  const handleRevert = () => {
    setErrors({})
    setMessage(null)
    onReloaded()
  }

  const handleDelete = () => {
    remove.mutate(
      { namespace, etag },
      {
        onSuccess: () => {
          setConfirmDelete(false)
          onDeleted?.()
        },
      },
    )
  }

  const groups = draft.groups ?? []
  const ruleCount = groups.reduce((total, g) => total + g.rules.length, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{namespace}</Badge>
        <span className="text-xs text-muted-foreground">
          {groups.length} group{groups.length === 1 ? "" : "s"}, {ruleCount} rule{ruleCount === 1 ? "" : "s"}
        </span>
        {etag && <span className="text-xs text-muted-foreground">etag {etag}</span>}
        {dirty && <span className="text-xs text-yellow-600 dark:text-yellow-500">unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          {(message || save.isError) && (
            <span className="text-xs text-muted-foreground">
              {save.isError
                ? save.error instanceof Error
                  ? save.error.message
                  : "Save failed"
                : message}
            </span>
          )}
          <Button variant="outline" size="sm" disabled={save.isPending} onClick={handleRevert}>
            <RotateCcw className="h-3.5 w-3.5" />
            Revert
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending || !dirty}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      <FieldError>{errors.groups}</FieldError>

      {groups.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          This namespace has no rule groups yet.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <GroupCard
              key={gi}
              group={group}
              index={gi}
              errors={errors}
              onChange={(next) => update((c) => ({ ...c, groups: c.groups.map((g, i) => (i === gi ? next : g)) }))}
              onRemove={() => update((c) => ({ ...c, groups: c.groups.filter((_, i) => i !== gi) }))}
            />
          ))}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => update((c) => ({ ...c, groups: [...c.groups, emptyDraftGroup(c.groups.length + 1)] }))}
      >
        <Plus className="h-3.5 w-3.5" />
        Add rule group
      </Button>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete alert rules</DialogTitle>
            <DialogDescription>
              Every rule group in <code className="rounded bg-muted px-1">{namespace}</code> will be removed. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {remove.isError && (
            <p className="text-sm text-destructive">
              {remove.error instanceof Error ? remove.error.message : "Delete failed"}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={handleDelete}>
              {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
