"use client"

import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { useTheme } from "@/components/theme-provider"

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    primaryColor: "#2563eb",
    primaryBorderColor: "#1d4ed8",
    lineColor: "#64748b",
    secondaryColor: "#f1f5f9",
    tertiaryColor: "#f8fafc",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
  },
})

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [id] = useState(() => `mermaid-${Math.random().toString(36).slice(2, 9)}`)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!ref.current) return

    const render = async () => {
      const cleaned = chart.replace(/^\s+/gm, "").trim()
      const isDark = resolvedTheme === "dark"
      const themed = isDark
        ? `%%{init:{'theme':'dark'}}%%\n${cleaned}`
        : cleaned

      try {
        const { svg } = await mermaid.render(id, themed)
        if (ref.current) {
          ref.current.innerHTML = svg
        }
      } catch (e) {
        console.error("Mermaid render failed", e)
      }
    }

    render()
  }, [chart, id, resolvedTheme])

  return <div ref={ref} className="mermaid flex justify-center" />
}
