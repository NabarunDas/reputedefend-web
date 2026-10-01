import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { loadSearch } from "@/lib/reports/queries"
import { EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Search" }

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const query = await searchParams
  const q = String(Array.isArray(query.q) ? query.q[0] : query.q || "").trim()
  const cursor = String(Array.isArray(query.cursor) ? query.cursor[0] : query.cursor || "")
  const result = q.length >= 2 ? await loadSearch(q.slice(0, 100), cursor || null) as {
    status?: string; reason?: string; results?: Array<{ id: string; label: string; category: string; href: string }>; hasMore?: boolean; nextCursor?: string
  } : null
  return <section className="page">
    <PageHeader title="Search" description="Case reference, client name, currently verified email, business, location and invoice reference only." />
    <form method="get" className="filters" role="search">
      <label>Query<input name="q" minLength={2} maxLength={100} defaultValue={q} autoComplete="off" /></label>
      <button>Search</button>
    </form>
    {q && q.length < 2 && <p role="status">Enter at least two characters.</p>}
    {result?.status === "invalid" && <p role="status">{result.reason === "invalid_cursor" ? "That page link is invalid." : "The search query is not valid."}</p>}
    {result?.status === "success" && !result.results?.length && <EmptyState>No matching records in the allowed fields.</EmptyState>}
    {!!result?.results?.length && <section className="panel">
      <h2>Results</h2>
      <ul>{result.results.map(item => <li key={`${item.category}-${item.id}`}><Link href={item.href}>{item.label}</Link> <span className="muted">{item.category}</span></li>)}</ul>
      {result.hasMore && result.nextCursor && <p className="pagination"><Link href={`/search?q=${encodeURIComponent(q)}&cursor=${encodeURIComponent(result.nextCursor)}`}>View more</Link></p>}
    </section>}
  </section>
}
