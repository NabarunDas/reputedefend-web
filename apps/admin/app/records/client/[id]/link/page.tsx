import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { isUuid, recordPath, searchFilters } from "@/lib/records/model"
import { getMembership, listRecords, recordDetail } from "@/lib/records/queries"
import { MembershipForm } from "../../../forms"
import { EmptyState, PageHeader } from "../../../../ui"

export default async function LinkBusiness({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { id } = await params, query = await searchParams
  const client = await recordDetail("client", id)
  if (query.business !== undefined) {
    if (!isUuid(query.business)) notFound()
    const business = await recordDetail("business", query.business)
    const existing = await getMembership(id, business.record.id)
    return <section className="page"><Link className="back-link" href={recordPath("client", id)}>Back to client</Link><PageHeader title={`Link ${client.record.name}`} description={<>Business: <Link href={recordPath("business", business.record.id)}>{business.record.name}</Link></>} /><section className="panel"><MembershipForm key={existing?.version || 0} customerId={id} businessId={business.record.id} membership={existing} /></section></section>
  }
  const filters = searchFilters(query)
  if (!filters) notFound()
  const rows = await listRecords("business", filters)
  const next = new URLSearchParams({ q: filters.q, after: rows.slice(0, 50).at(-1)?.id || "" })
  return <section className="page">
    <Link className="back-link" href={recordPath("client", id)}>Back to client</Link>
    <PageHeader title="Choose a business" description={`Link an existing business to ${client.record.name}.`} />
    <section className="panel">
      <form method="get" className="filters"><label>Business name<input name="q" maxLength={100} defaultValue={filters.q} /></label><button>Search</button></form>
      <ul>{rows.slice(0, 50).map(b => <li key={b.id}><Link href={`?business=${b.id}`}>{b.name}</Link></li>)}</ul>
      {!rows.length && <EmptyState>No matching businesses. <Link href={recordPath("business", "new")}>Add a business</Link>, then return to link it.</EmptyState>}
      {rows.length > 50 && <div className="pagination"><Link href={`?${next}`}>Next page</Link></div>}
    </section>
  </section>
}
