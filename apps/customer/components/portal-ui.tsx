const ACCOUNT_FALLBACK = "My account"

/** Uses the session display name only. The neutral fallback stays out of the greeting. */
export function welcomeHeading(accountName?: string | null): string {
  if (typeof accountName !== "string") return "Welcome back"
  const name = accountName.trim()
  if (!name || name === ACCOUNT_FALLBACK || name.length > 200) return "Welcome back"
  return `Welcome back, ${name}`
}

export function PageHeading({ title, lede, context }: { title: string; lede?: string; context?: string }) {
  return (
    <header className="portal-page-head">
      {context ? <p className="portal-page-context">{context}</p> : null}
      <h1>{title}</h1>
      {lede ? <p className="lead">{lede}</p> : null}
    </header>
  )
}
