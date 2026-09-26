"use client"

import { AppShell } from "@/components/layout/app-shell"

/**
 * Layout for the top-level, global (non cluster-scoped) pages. These pages are not
 * cluster scoped, so they live outside /dashboard but reuse the dashboard shell so
 * the header (settings flyout, alert indicator, theme toggle) stays available.
 */
export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
