import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { devCaseJourneyPreviewEnabled } from "@/lib/case-journey/gate"
import { presentCaseJourney, selectJourneyStep } from "@/lib/case-journey/present"
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
  const journey = presentCaseJourney(facts, new Date().toISOString())
  const selectedId = selectJourneyStep(journey, query.step)
  return <CaseJourneyView
    reference={detail.reference}
    customer={detail.client}
    business={detail.business}
    caseId={detail.id}
    journey={journey}
    selectedId={selectedId}
  />
}
