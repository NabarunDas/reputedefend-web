import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { isEntity, isUuid, recordPath } from "@/lib/records/model"
import { duplicatePreview } from "@/lib/records/queries"
import { PageHeader } from "../../ui"

export default async function Duplicates({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { entity, left, right } = await searchParams
  if (typeof entity !== "string" || !isEntity(entity) || entity === "location" || !isUuid(left)) notFound()
  if (!right) return <section className="page"><PageHeader title="Compare records" description="Copy the other record’s ID from its details page. This comparison does not change either record." /><section className="panel"><form method="get"><input type="hidden" name="entity" value={entity} /><input type="hidden" name="left" value={left} /><label>Other record ID<input name="right" required pattern="[0-9a-fA-F-]{36}" /></label><button>Compare</button></form><p><Link href={recordPath(entity, left)}>Back to record</Link></p></section></section>
  if (!isUuid(right) || left === right) return <section className="page"><PageHeader title="Choose two different records" /><section className="panel"><Link href={recordPath(entity, left)}>Back to record</Link></section></section>
  const preview = await duplicatePreview(entity, left, right)
  return <section className="page">
    <PageHeader title="Duplicate comparison" />
    <section className="panel">
      <p className="notice">This is a read-only review. No records, references, payments or relationships will be moved or deleted.</p>
      <div className="comparison">{(["left", "right"] as const).map(side => <section key={side}><h2><Link href={recordPath(entity, preview[side].record.id)}>{preview[side].record.name}</Link></h2><p className="reference">{preview[side].record.id}</p><p>{preview[side].record.email || preview[side].record.website}</p><dl><dt>Cases</dt><dd>{preview[`${side}Cases`]}</dd><dt>Monitoring requests</dt><dd>{preview[`${side}Monitoring`]}</dd>{entity === "business" && <><dt>Locations</dt><dd>{preview[`${side}Locations`]}</dd></>}</dl><h3>Recent work (up to 100)</h3><ul>{preview[side].work.map(w => <li key={`${w.kind}-${w.reference}`}>{w.reference} — {w.status}</li>)}</ul></section>)}</div>
      <p>Merging records is not enabled. Keep both records until their relationships and retained history have been reviewed.</p>
    </section>
  </section>
}
