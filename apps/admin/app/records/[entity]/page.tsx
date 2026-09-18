import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { entities, isEntity, recordPath, searchFilters } from "@/lib/records/model"
import { listRecords } from "@/lib/records/queries"
import { Badge, EmptyState, PageHeader } from "../../ui"

export default async function RecordsPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { entity } = await params
  if (!isEntity(entity)) notFound()
  const filters = searchFilters(await searchParams)
  if (!filters) return <section className="page"><PageHeader title="Check your search" /><section className="panel"><Link href={`/records/${entity}`}>Start a new search</Link></section></section>
  const rows = await listRecords(entity, filters), visible = rows.slice(0, 50)
  const next = new URLSearchParams({ q: filters.q, ...(filters.business ? { business: filters.business } : {}) })
  if (visible.length) next.set("after", visible[visible.length - 1].id)
  return <section className="page">
    <PageHeader title={entities[entity]} description={entity === "client" ? "Find a client, check their contact details and review their business relationships." : entity === "business" ? "Manage businesses and their locations. Check a client’s authority before verifying a relationship." : "Locations linked to business records. A location record alone does not mean monitoring is active."} actions={(entity !== "location" || filters.business) ? <Link className="button-link" href={`${recordPath(entity, "new")}${filters.business ? `?business=${filters.business}` : ""}`}>Add {entity === "client" ? "client" : entity === "business" ? "business" : "location"}</Link> : undefined} />
    <section className="panel">
      <nav className="record-tabs" aria-label="Record types">{Object.entries(entities).map(([key, label]) => <Link key={key} href={`/records/${key}`} aria-current={key === entity ? "page" : undefined}>{label}</Link>)}</nav>
      {entity === "location" && !filters.business && <p>Add a location from its business page.</p>}
      <form method="get" className="filters"><label>Search<input name="q" maxLength={100} defaultValue={filters.q} placeholder={entity === "client" ? "Name, email or phone" : "Name or details"} /></label>{filters.business && <input type="hidden" name="business" value={filters.business} />}<button>Search</button><Link href={`/records/${entity}`}>Clear search</Link></form>
      {!visible.length ? <EmptyState>No {entities[entity].toLowerCase()} match this search.</EmptyState> : <div className="table-scroll" role="region" aria-label={entities[entity]} tabIndex={0}><table><caption>Up to 50 records per page</caption><thead><tr><th scope="col">Name</th><th scope="col">Details</th><th scope="col">Status</th></tr></thead><tbody>{visible.map(item => <tr key={item.id}><td><Link href={recordPath(entity, item.id)}>{item.name || "Unnamed location"}</Link></td><td>{entity === "client" ? <>{item.email}<br />{item.phone || "No phone recorded"}</> : entity === "business" ? item.website || "No website recorded" : <>{item.businessName}<br />{item.country}</>}</td><td>{entity === "client" ? <Badge tone={item.emailVerified ? "success" : "warning"}>Email {item.emailVerified ? "verified" : "not verified"}</Badge> : `Record version ${item.version}`}</td></tr>)}</tbody></table></div>}
      <div className="pagination">{filters.after && <Link href={`/records/${entity}?${new URLSearchParams({ q: filters.q, ...(filters.business ? { business: filters.business } : {}) })}`}>First page</Link>}{rows.length > 50 && <Link href={`/records/${entity}?${next}`}>Next page</Link>}</div>
    </section>
  </section>
}
