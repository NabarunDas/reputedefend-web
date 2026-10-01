import Link from "next/link"

export const adminNavItems = [
  { href: "/", label: "Today", match: (pathname: string) => pathname === "/" },
  { href: "/search", label: "Search", match: (pathname: string) => pathname.startsWith("/search") },
  { href: "/enquiries", label: "Enquiries", match: (pathname: string) => pathname.startsWith("/enquiries") },
  { href: "/records/client", label: "Clients & Businesses", match: (pathname: string) => pathname.startsWith("/records") },
  { href: "/cases", label: "Cases", match: (pathname: string) => pathname.startsWith("/cases") },
  { href: "/documents", label: "Documents", match: (pathname: string) => pathname.startsWith("/documents") },
  { href: "/tasks", label: "Tasks", match: (pathname: string) => pathname.startsWith("/tasks") },
  { href: "/activity", label: "Activity", match: (pathname: string) => pathname.startsWith("/activity") },
  { href: "/reports", label: "Reports", match: (pathname: string) => pathname.startsWith("/reports") },
  { href: "/communications", label: "Communications", match: (pathname: string) => pathname.startsWith("/communications") },
  { href: "/conversations", label: "Conversations", match: (pathname: string) => pathname.startsWith("/conversations") },
  { href: "/commercial", label: "Commercial", match: (pathname: string) => pathname.startsWith("/commercial") },
  { href: "/money", label: "Money", match: (pathname: string) => pathname.startsWith("/money") },
  { href: "/guard", label: "Guard", match: (pathname: string) => pathname.startsWith("/guard") && !pathname.startsWith("/guard/checks") && !pathname.startsWith("/guard/alerts") },
  { href: "/guard/checks", label: "Checks", match: (pathname: string) => pathname.startsWith("/guard/checks") },
  { href: "/guard/alerts", label: "Alerts", match: (pathname: string) => pathname.startsWith("/guard/alerts") },
  { href: "/operations/jobs", label: "Jobs", match: (pathname: string) => pathname.startsWith("/operations") },
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
