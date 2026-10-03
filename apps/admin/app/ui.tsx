import type { ReactNode } from "react"

const badgeMarks = {
  neutral: "",
  info: "●",
  success: "✓",
  warning: "!",
  danger: "×",
} as const

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeMarks; children: ReactNode }) {
  const mark = badgeMarks[tone]
  return <span className={`badge badge-${tone}`}>
    {mark ? <span className="badge-mark" aria-hidden="true">{mark}</span> : null}
    {children}
  </span>
}

/**
 * A page message. Colour is paired with the words inside it.
 *
 * Static server-rendered notices have no live-region role, so a screen reader
 * meets them in document order. Pass `live="status"` only for a dynamic
 * update, and `live="alert"` only when the operator must be interrupted.
 * Command forms keep their own `role="status"` results; they do not use this.
 */
export function Notice({
  tone = "info",
  children,
  live,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "blocked"
  children: ReactNode
  live?: "status" | "alert"
}) {
  const className = tone === "info" ? "notice" : tone === "danger" ? "notice notice-danger" : `notice notice-${tone}`
  return <div className={className} role={live}>{children}</div>
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>
}

export function queueCountLabel(rows: { length: number }): string {
  return rows.length > 50 ? "50+" : String(rows.length)
}
