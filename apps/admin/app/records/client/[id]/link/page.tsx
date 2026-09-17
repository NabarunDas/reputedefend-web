import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { isUuid, recordPath, searchFilters } from "@/lib/records/model"
import { getMembership, listRecords, recordDetail } from "@/lib/records/queries"
import { AdminNav } from "../../../../admin-nav"
import { MembershipForm } from "../../../forms"
export default async function LinkBusiness({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { id } = await params, query = await searchParams
  const client = await recordDetail("client", id)
  if (query.business !== undefined) {
    if (!isUuid(query.business)) notFound()
    const business = await recordDetail("business", query.business)
    const existing = await getMembership(id, business.record.id)
    return <section className="panel"><AdminNav current="records" /><Link href={recordPath("client", id)}>Back to client</Link><h1>Link {client.record.name}</h1><p>Business: <Link href={recordPath("business", business.record.id)}>{business.record.name}</Link></p><MembershipForm key={existing?.version || 0} customerId={id} businessId={business.record.id} membership={existing} /></section>
  }
  const filters = searchFilters(query)
  if (!filters) notFound()
  const rows = await listRecords("business", filters)
  const next = new URLSearchParams({ q: filters.q, after: rows.slice(0,50).at(-1)?.id || "" })
  return <section className="panel"><AdminNav current="records" /><Link href={recordPath("client", id)}>Back to client</Link><h1>Choose a business</h1><p>Link an existing business to {client.record.name}.</p><form method="get" className="filters"><label>Business name<input name="q" maxLength={100} defaultValue={filters.q} /></label><button>Search</button></form><ul>{rows.slice(0,50).map(b => <li key={b.id}><Link href={`?business=${b.id}`}>{b.name}</Link></li>)}</ul>{!rows.length && <p>No matching businesses. <Link href={recordPath("business", "new")}>Add a business</Link>, then return to link it.</p>}{rows.length > 50 && <Link href={`?${next}`}>Next page</Link>}</section>
}
