import Link from "next/link"

export const adminNavItems = [
  { href: "/", label: "Today", match: (pathname: string) => pathname === "/" },
  { href: "/enquiries", label: "Enquiries", match: (pathname: string) => pathname.startsWith("/enquiries") },
  { href: "/records/client", label: "Clients & Businesses", match: (pathname: string) => pathname.startsWith("/records") },
  { href: "/cases", label: "Cases", match: (pathname: string) => pathname.startsWith("/cases") },
  { href: "/documents", label: "Documents", match: (pathname: string) => pathname.startsWith("/documents") },
  { href: "/tasks", label: "Tasks", match: (pathname: string) => pathname.startsWith("/tasks") },
  { href: "/activity", label: "Activity", match: (pathname: string) => pathname.startsWith("/activity") },
  { href: "/security", label: "Security", match: (pathname: string) => pathname.startsWith("/security") },
] as const

export function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <nav className="admin-nav" aria-label="Admin workspace">
    {adminNavItems.map(item => (
      <Link
        key={item.href}
        href={item.href}
        aria-current={item.match(pathname) ? "page" : undefined}
        onClick={onNavigate}
      >
        {item.label}
      </Link>
    ))}
  </nav>
}
