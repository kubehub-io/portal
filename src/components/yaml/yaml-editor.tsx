"use client"

import { useMemo } from "react"
import dynamic from "next/dynamic"
import { yaml } from "@codemirror/lang-yaml"
import type { Extension } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { useTheme } from "@/components/theme-provider"

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
      Loading editor…
    </div>
  ),
})

/**
 * Hard ceiling on the editor box. Without it a very long line can inflate the
 * editor's intrinsic size, which leaks up the flex/percentage chain and pushes
 * anything laid out after the editor (e.g. a Save/Cancel footer) out of view.
 */
const containmentTheme = EditorView.theme({
  "&": { maxWidth: "100%", maxHeight: "100%" },
  "& .cm-content": { maxWidth: "100%" },
})

/** Long lines wrap instead of scrolling sideways, keeping the box at 100%. */
const lineWrapping = EditorView.lineWrapping

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
  const baseExtensions = useMemo(
    () => [lineWrapping, containmentTheme, yaml(), ...(extensions ?? [])],
    [extensions],
  )
  const { resolvedTheme } = useTheme()

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-md border ${className ?? ""}`}
      style={{ height, maxHeight: "100%" }}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        height="100%"
        style={{ height: "100%", fontSize: "13px" }}
        theme={resolvedTheme}
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
