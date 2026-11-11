import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { isLinkableHostname, isWildcardHostname, normaliseHostnames } from "@/lib/hostnames"

/**
 * Renders one or more hostnames, each on its own line. Concrete DNS names link to
 * https://<name>; wildcards and other non-routable values are shown as plain text.
 */
export function HostnameList({
  names,
  empty = "-",
}: {
  names: unknown
  empty?: string
}) {
  const values = normaliseHostnames(names)
  if (values.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {values.map((name) => {
        const linkable = isLinkableHostname(name)
        const wildcard = isWildcardHostname(name)
        const className = cn(
          "inline-flex max-w-full items-center gap-1 text-xs font-mono break-all",
          linkable
            ? "text-primary underline underline-offset-2 hover:text-primary/80"
            : "text-muted-foreground",
        )

        if (!linkable) {
          return (
            <span
              key={name}
              className={className}
              title={
                wildcard
                  ? "Wildcard hostname — open a concrete host to visit it"
                  : "Not a linkable DNS name"
              }
            >
              {name}
            </span>
          )
        }

        return (
          <a
            key={name}
            href={`https://${name}`}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
            title={`Open https://${name}`}
          >
            <span>{name}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        )
      })}
    </div>
  )
}
