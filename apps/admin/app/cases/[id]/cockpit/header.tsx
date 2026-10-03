import Link from "next/link"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowModel } from "@/lib/case-flow/model"
import { isUuid } from "@/lib/records/model"
import { Badge } from "../../../ui"
import { caseStatusLabel, priorityLabel, serviceTrackLabels } from "./presentation"

/**
 * Who the case belongs to and what kind of case it is, in one block.
 *
 * The technical stage is deliberately not here. It stays on the page, lower
 * down, where an operator who wants it can find it; the headline is the
 * reference and the people, because that is what identifies the case.
 */
export function CaseHeader({ c, flow }: { c: CaseDetail; flow: CaseFlowModel }) {
  const status = caseStatusLabel(c.status)
  const priority = priorityLabel(c.priority)
  return <header className="page-header cockpit-header">
    <div>
      <p className="eyebrow">Case</p>
      <h1>{c.reference}</h1>
      <p className="cockpit-parties">{c.client} — {c.business}</p>
      <p className="badge-row">
        <Badge tone={status.tone}>{status.word}</Badge>
        <Badge tone="neutral">Service: {serviceTrackLabels[flow.serviceTrack]}</Badge>
        <Badge tone={priority.tone}>{priority.word}</Badge>
      </p>
      <p className="cockpit-links">
        <RecordLink id={c.customerId} href={`/records/client/${c.customerId}`} label="Client record" missing="No client record" />
        <RecordLink id={c.businessId} href={`/records/business/${c.businessId}`} label="Business record" missing="No business record" />
        <RecordLink id={c.locationId} href={`/records/location/${c.locationId}`} label="Location record" missing="No location recorded" />
        {isUuid(c.id) && <Link href={`/cases/${c.id}/commercial`}>Commercial and money</Link>}
      </p>
    </div>
  </header>
}

/**
 * A record is only linked when its identifier is a UUID. A case with a
 * missing or malformed reference says so rather than offering a route that
 * would resolve to nothing.
 */
function RecordLink({ id, href, label, missing }: { id: string | null; href: string; label: string; missing: string }) {
  if (!id || !isUuid(id)) return <span className="muted">{missing}</span>
  return <Link href={href}>{label}</Link>
}
