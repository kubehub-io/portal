const DURATION_RE = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h|d|w|y))+$/

/** Prometheus / Alertmanager duration syntax, e.g. "30s", "5m", "1h30m". */
export function isDuration(value: string): boolean {
  return DURATION_RE.test(value.trim())
}

export const DURATION_HINT = "Duration such as 30s, 5m or 1h30m"
