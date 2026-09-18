import Link from "next/link"
export function AdminNav({ current }: { current: "sessions" | "activity" | "records" | "enquiries" }) {
  return <nav className="admin-nav" aria-label="Admin workspace">
    <Link href="/" aria-current={current === "sessions" ? "page" : undefined}>Account &amp; sessions</Link>
    <Link href="/enquiries" aria-current={current === "enquiries" ? "page" : undefined}>Enquiries</Link>
    <Link href="/records/client" aria-current={current === "records" ? "page" : undefined}>Clients &amp; businesses</Link>
    <Link href="/activity" aria-current={current === "activity" ? "page" : undefined}>Activity</Link>
  </nav>
}
