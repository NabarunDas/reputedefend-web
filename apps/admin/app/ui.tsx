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
 * `role="status"` is the default so a screen reader hears it without an
 * interrupting alert. Pass `urgent` only for something the operator must
 * deal with before continuing.
 */
export function Notice({
  tone = "info",
  children,
  urgent = false,
}: {
  tone?: "info" | "success" | "warning" | "danger" | "blocked"
  children: ReactNode
  urgent?: boolean
}) {
  const className = tone === "info" ? "notice" : tone === "danger" ? "notice notice-danger" : `notice notice-${tone}`
  return <div className={className} role={urgent ? "alert" : "status"}>{children}</div>
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
