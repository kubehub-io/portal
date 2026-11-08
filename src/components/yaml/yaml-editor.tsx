"use client"

import * as React from "react"
import { useMemo, useState, useRef, useCallback, useLayoutEffect, useEffect } from "react"
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
  /** Allow the editor box to be resized by dragging the anchor at its bottom-right. */
  resizable?: boolean
}

export function YamlEditor({
  value,
  onChange,
  height = "24rem",
  readOnly = false,
  className,
  extensions,
  resizable = false,
}: YamlEditorProps) {
  const baseExtensions = useMemo(
    () => [lineWrapping, containmentTheme, yaml(), ...(extensions ?? [])],
    [extensions],
  )
  const { resolvedTheme } = useTheme()

  const [size, setSize] = useState<{ width?: number; height?: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const innerRef = useRef<HTMLDivElement>(null)

  const setRefs = useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node
  }, [])

  const clampSize = useCallback(
    (width: number, height: number) => ({
      width: Math.min(window.innerWidth - 40, Math.max(240, width)),
      height: Math.min(window.innerHeight - 40, Math.max(160, height)),
    }),
    [],
  )

  useLayoutEffect(() => {
    if (resizable && innerRef.current && size === null) {
      const { offsetWidth, offsetHeight } = innerRef.current
      setSize(clampSize(offsetWidth || 0, offsetHeight || 0))
    }
  }, [resizable, size, clampSize])

  useEffect(() => {
    if (!resizable) return
    const onWindowResize = () => {
      const el = innerRef.current
      if (!el) return
      setSize((prev) =>
        clampSize(prev?.width ?? el.offsetWidth, prev?.height ?? el.offsetHeight),
      )
    }
    window.addEventListener("resize", onWindowResize)
    return () => window.removeEventListener("resize", onWindowResize)
  }, [resizable, clampSize])

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget.parentElement
      if (!el) return
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: el.offsetWidth,
        h: el.offsetHeight,
      }
      setIsDragging(true)
    },
    [],
  )

  useEffect(() => {
    if (!isDragging) return
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "nwse-resize"
    document.body.style.userSelect = "none"
    const onPointerMove = (e: PointerEvent) => {
      e.preventDefault()
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setSize(clampSize(dragStart.current.w + dx, dragStart.current.h + dy))
    }
    const onPointerUp = () => setIsDragging(false)
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [isDragging, clampSize])

  const containerStyle: React.CSSProperties = resizable
    ? size
      ? { width: size.width, height: size.height, maxWidth: "none", maxHeight: "none" }
      : { height, maxHeight: "100%" }
    : { height, maxHeight: "100%" }

  return (
    <div
      ref={setRefs}
      className={`relative min-w-0 overflow-hidden rounded-md border ${className ?? ""}`}
      style={containerStyle}
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
      {resizable && (
        <div
          role="separator"
          aria-label="Resize"
          className="absolute bottom-0 right-0 z-10 flex h-6 w-6 cursor-nwse-resize touch-none select-none items-center justify-center opacity-40 transition-opacity hover:opacity-100"
          onPointerDown={onResizePointerDown}
        >
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M10 2L2 10" />
            <path d="M10 5L5 10" />
          </svg>
        </div>
      )}
    </div>
  )
}
