const destinations = [
  { label: "Dashboard", href: "/portal" },
  { label: "Cases" },
  { label: "Documents" },
  { label: "Payments" },
  { label: "Relaunch Guard" },
  { label: "Account" },
] as const

export function PortalNav() {
  return (
    <nav className="portal-nav" aria-label="Customer portal">
      <ul className="portal-nav-list">
        {destinations.map(item => (
          <li key={item.label}>
            {"href" in item ? (
              <a className="portal-nav-link" href={item.href} aria-current="page">{item.label}</a>
            ) : (
              <span className="portal-nav-disabled" aria-disabled="true">
                {item.label}
                <span className="sr-only"> not available yet</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
