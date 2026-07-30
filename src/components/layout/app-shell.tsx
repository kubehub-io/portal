"use client"

import { useAuth } from "@/hooks/use-auth"
import { Sidebar } from "@/components/layout/sidebar"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { LogOut, Sun, Moon, Monitor } from "lucide-react"
import { redirect } from "next/navigation"

const nextTheme: Record<string, "light" | "dark" | "system"> = {
  system: "light",
  light: "dark",
  dark: "system",
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme[theme])}
      title={`Theme: ${theme}`}
    >
      {theme === "system" ? (
        <Monitor className="h-4 w-4" />
      ) : theme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, clearTokens } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    redirect("/")
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <h1 className="text-lg font-semibold">KubeHub Dashboard</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={clearTokens}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
