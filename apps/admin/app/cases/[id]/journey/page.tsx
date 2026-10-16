import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { sendDisabledReason } from "@/lib/communications/gate"
import { loadCaseCommunications } from "@/lib/communications/queries"
import { devCaseJourneyPreviewEnabled } from "@/lib/case-journey/gate"
import { buildJourneyDocuments } from "@/lib/case-journey/documents"
import { buildJourneyIntake } from "@/lib/case-journey/intake"
import { loadJourneyExtension } from "@/lib/case-journey/read"
import { presentCaseJourney, selectJourneyStep } from "@/lib/case-journey/present"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { getMembership, recordDetail } from "@/lib/records/queries"
import { requireStaff } from "@/lib/require-staff"
import { CaseJourneyView } from "./view"

export const metadata = { title: "Case workflow preview" }

/**
 * DEV/develop preview of the eleven-step workflow.
 *
 * The environment check runs before any case read, so Production and other
 * Preview branches never resolve a case through this route. Staff auth is
 * the same check the rest of Admin already uses.
 */
export default async function CaseJourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ step?: string | string[] }>
}) {
  if (!devCaseJourneyPreviewEnabled()) notFound()
  await requireStaff()
  const { id } = await params
  const query = await searchParams
  if (Array.isArray(query.step)) notFound()
  const [detail, facts] = await Promise.all([getCase(id), loadCaseFlowFacts(id)])
  const [customer, business, location, membership, extension] = await Promise.all([
    recordDetail("client", detail.customerId),
    recordDetail("business", detail.businessId),
    recordDetail("location", detail.locationId),
    getMembership(detail.customerId, detail.businessId),
    loadJourneyExtension(detail.id),
  ])
  const events = extension?.events ?? detail.events.map(event => ({
    event: event.event,
    createdAt: event.createdAt,
    details: event.details,
  }))
  const brief = buildJourneyIntake({
    message: detail.issue,
    reviewUrl: detail.reviewUrl,
    customer: customer.record,
    business: business.record,
    location: location.record,
    duplicates: business.duplicates,
    projectedEmailVerified: facts.authorization.customerEmailVerified,
    projectedAuthority: facts.authorization.businessAuthorityVerified,
    membershipStatus: membership?.status ?? null,
    snapshot: extension?.snapshot ?? null,
    openedAt: extension?.openedAt ?? detail.createdAt,
  })
  const journey = presentCaseJourney(facts, new Date().toISOString(), events, {
    recordConflict: brief.conflicts.length > 0,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
  })
  const selectedId = selectJourneyStep(journey, query.step)
  const selected = journey.steps.find(step => step.id === selectedId)
  const documents = selected?.id === "REQUEST_DOCUMENTS" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
    ? buildJourneyDocuments({
      caseType: detail.type,
      issue: brief.snapshot?.details || brief.message,
      businessName: detail.business,
      requests: (await getEvidenceCase(detail.id)).requests,
      history: await loadCaseCommunications(detail.id),
      sendDisabledReason: sendDisabledReason(),
    })
    : null
  return <CaseJourneyView
    reference={detail.reference}
    customer={detail.client}
    business={detail.business}
    caseId={detail.id}
    journey={journey}
    selectedId={selectedId}
    brief={brief}
    version={detail.version}
    documents={documents}
  />
}
