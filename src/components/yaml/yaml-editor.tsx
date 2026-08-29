"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { yaml } from "@codemirror/lang-yaml"
import type { Extension } from "@codemirror/state"

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
})

export interface YamlEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  readOnly?: boolean
  className?: string
  onValidationChange?: (error: string | null) => void
  /** Called whenever the contents change with a parse error message or null. */
  extensions?: Extension[]
}

export function YamlEditor({
  value,
  onChange,
  height = "24rem",
  readOnly = false,
  className,
  extensions,
}: YamlEditorProps) {
  const baseExtensions = useMemo(() => [yaml(), ...(extensions ?? [])], [extensions])

  return (
    <div
      className={`overflow-hidden rounded-md border ${className ?? ""}`}
      style={{ height }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        height="100%"
        style={{ height: "100%", fontSize: "13px" }}
        theme="light"
        extensions={baseExtensions}
        editable={!readOnly}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          indentOnInput: true,
          foldGutter: true,
          autocompletion: false,
          searchKeymap: true,
        }}
      />
    </div>
  )
}
