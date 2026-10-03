"use client"

import { usePathname } from "next/navigation"

const linked = [
  { label: "Dashboard", href: "/portal" },
  { label: "Cases", href: "/portal/cases" },
  { label: "Documents", href: "/portal/documents" },
  { label: "Payments", href: "/portal/payments" },
] as const

const unavailable = ["Relaunch Guard", "Account"] as const

function current(pathname: string, href: string) {
  if (href === "/portal") return pathname === "/portal"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PortalNav() {
  const pathname = usePathname()
  return (
    <nav className="portal-nav" aria-label="Customer portal">
      <ul className="portal-nav-list">
        {linked.map(item => {
          const active = current(pathname, item.href)
          return (
            <li key={item.label}>
              <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                {item.label}
              </a>
            </li>
          )
        })}
        {unavailable.map(label => (
          <li key={label}>
            <span className="portal-nav-disabled" aria-disabled="true">
              {label}
              <span className="sr-only"> not available yet</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  )
}
