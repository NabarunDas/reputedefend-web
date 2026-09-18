import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { entities, isEntity, isUuid, recordPath, safeWebUrl } from "@/lib/records/model"
import { recordDetail } from "@/lib/records/queries"
import { ukDate } from "@/lib/admin/activity"
import { MembershipForm, RecordForm, VerifyContactForm } from "../../forms"
import { PageHeader } from "../../../ui"

export default async function RecordPage({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { entity, id } = await params
  if (!isEntity(entity)) notFound()
  if (id === "new") {
    const { business } = await searchParams
    const parent = entity === "location" && isUuid(business) ? await recordDetail("business", business) : null
    if (entity === "location" && !parent) notFound()
    return <section className="page"><Link className="back-link" href={`/records/${entity}`}>Back to {entities[entity].toLowerCase()}</Link><PageHeader title={`Add ${entity}`} description={parent ? <>Business: <Link href={recordPath("business", parent.record.id)}>{parent.record.name}</Link></> : undefined} /><section className="panel"><RecordForm entity={entity} businessId={parent?.record.id} /></section></section>
  }
  const detail = await recordDetail(entity, id), r = detail.record
  const url = safeWebUrl(r.website || r.profileUrl)
  return <section className="page">
    <Link className="back-link" href={`/records/${entity}`}>Back to {entities[entity].toLowerCase()}</Link>
    <PageHeader title={r.name || "Unnamed location"} description={`Record ID: ${r.id} · Version ${r.version}`} />
    <section className="panel">
      {entity === "client" && <p>Email: {r.email} — {r.emailVerified ? "verified" : "not verified"}<br />Phone: {r.phone || "Not recorded"} — {r.phoneVerified ? "verified" : "not verified"}</p>}
      {entity === "location" && <p>Business: <Link href={recordPath("business", r.businessId!)}>{r.businessName}</Link><br />Country: {r.country}</p>}
      {url && <p><a href={url} target="_blank" rel="noopener noreferrer">{entity === "business" ? "Open website" : "Open business profile"} (new tab)</a></p>}
    </section>
    <details className="panel"><summary>Edit details</summary><RecordForm key={r.version} entity={entity} record={r} /></details>
    {entity === "client" && <details className="panel"><summary>Record a contact verification</summary><VerifyContactForm key={r.version} record={r} /></details>}
    {entity === "business" && <section className="panel"><h2>Locations</h2><p><Link href={`/records/location?business=${r.id}`}>View all locations</Link> · <Link href={`${recordPath("location", "new")}?business=${r.id}`}>Add a location</Link></p><p><Link href={`/records/client?business=${r.id}`}>View linked clients</Link></p></section>}
    {entity !== "location" && <section className="panel"><h2>{entity === "client" ? "Business relationships" : "Client relationships"}</h2><p className="muted">Authority is checked separately from submitted forms. Pending and withdrawn relationships do not grant access. Showing up to 100 relationships.</p>
      {entity === "client" && <p><Link href={`/records/client/${r.id}/link`}>Link a business</Link></p>}
      {!detail.memberships.length && <p>No relationships recorded yet.</p>}
      {detail.memberships.map(m => <article className="relationship" key={`${m.customerId}-${m.businessId}`}><h3><Link href={recordPath(entity === "client" ? "business" : "client", entity === "client" ? m.businessId : m.customerId)}>{m.name}</Link></h3><p>Status: {m.status === "verified" ? "Authority verified" : m.status === "revoked" ? "Access withdrawn" : "Awaiting authority check"}{m.verifiedAt ? ` · ${ukDate(m.verifiedAt)}` : ""}</p><p className="preserve-lines">{m.evidence}</p><details><summary>Update relationship</summary><MembershipForm key={m.version} customerId={m.customerId} businessId={m.businessId} membership={m} /></details></article>)}
    </section>}
    {entity === "client" && <section className="panel"><h2>Businesses named in submissions</h2><p className="muted">These links come from cases and monitoring requests. They are not evidence of ownership or authority. Showing up to 100.</p><ul>{detail.submittedBusinesses.map(b => <li key={b.id}><Link href={recordPath("business", b.id)}>{b.name}</Link> · <Link href={`/records/client/${r.id}/link?business=${b.id}`}>Review relationship</Link></li>)}</ul>{!detail.submittedBusinesses.length && <p>No submitted links.</p>}</section>}
    <section className="panel"><h2>Existing work</h2><p className="muted">Latest 100 case and monitoring submissions. These statuses are shown as recorded; a monitoring request is not proof of active coverage.</p>{!detail.work.length ? <p>No work recorded yet.</p> : <ul>{detail.work.map(w => <li key={`${w.kind}-${w.reference}`}><strong>{w.kind === "case" ? "Case" : "Monitoring request"} {w.reference}</strong> — {w.status} · {ukDate(w.submittedAt)}</li>)}</ul>}</section>
    {entity !== "location" && <section className="panel"><h2>Duplicate review</h2><p>Matching names are a prompt to check, not a reason to merge records. Up to 20 exact-name matches are shown.</p><ul>{detail.duplicates.map(d => <li key={d.id}><Link href={`/records/duplicates?entity=${entity}&left=${r.id}&right=${d.id}`}>Compare with {d.name} ({d.id.slice(0, 8)})</Link></li>)}</ul>{!detail.duplicates.length && <p>No other records have this exact name.</p>}<Link href={`/records/duplicates?entity=${entity}&left=${r.id}`}>Compare with another record</Link></section>}
  </section>
}
