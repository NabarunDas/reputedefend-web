"use client"

import { usePathname } from "next/navigation"

const linked = [
  { label: "Dashboard", href: "/portal", priority: "primary" },
  { label: "Cases", href: "/portal/cases", priority: "primary" },
  { label: "Documents", href: "/portal/documents", priority: "primary" },
  { label: "Payments", href: "/portal/payments", priority: "secondary" },
  { label: "Relaunch Guard", href: "/portal/guard", priority: "secondary" },
  { label: "Messages", href: "/portal/messages", priority: "primary" },
  { label: "Account", href: "/portal/account", priority: "secondary" },
] as const

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
            <li key={item.label} data-priority={item.priority}>
              <a className="portal-nav-link" href={item.href} {...(active ? { "aria-current": "page" as const } : {})}>
                {item.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
