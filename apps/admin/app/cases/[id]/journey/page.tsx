import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow, summariseCommercial } from "@/lib/case-flow/resolve"
import { loadCatalogue, loadOrder, loadQuote } from "@/lib/commerce/queries"
import { buildJourneyQuotePanel } from "@/lib/case-journey/quote"
import { activationOrderLink, buildJourneyActivationPanel } from "@/lib/case-journey/activation"
import { buildJourneyPreparationPanel, preparationRecordsDisagree } from "@/lib/case-journey/preparation"
import { buildJourneySubmissionPanel, submissionRecordsDisagree } from "@/lib/case-journey/submission"
import { presentJourneyOutcome } from "@/lib/case-journey/outcome"
import { getCaseAuthorization } from "@/lib/authorization/queries"
import { loadMoney } from "@/lib/payments/queries"
import { authConfig } from "@/lib/auth/config"
import { sendDisabledReason } from "@/lib/communications/gate"
import { linkSecret } from "@/lib/communications/link"
import { mailFromAddress } from "@/lib/communications/mail"
import { monitoredReplyMailbox } from "@/lib/communications/brand-email"
import { loadCaseCommunications } from "@/lib/communications/queries"
import { judgeAssessment } from "@/lib/case-journey/assessment"
import { loadCaseAssessment } from "@/lib/case-journey/assessment-command"
import { devCaseJourneyPreviewEnabled } from "@/lib/case-journey/gate"
import { buildJourneyDocuments } from "@/lib/case-journey/documents"
import { buildJourneyIntake } from "@/lib/case-journey/intake"
import { loadJourneyExtension } from "@/lib/case-journey/read"
import { presentCaseJourney, selectJourneyStep } from "@/lib/case-journey/present"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { buildEvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import type { PreparedPackCase } from "@/lib/packs/model"
import { getPreparedPackCase } from "@/lib/packs/queries"
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
  const [detail, facts, assessment] = await Promise.all([getCase(id), loadCaseFlowFacts(id), loadCaseAssessment(id)])
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
  const now = new Date().toISOString()
  const assessmentJudgement = assessment ? judgeAssessment(assessment) : null
  const journeyOptions = {
    recordConflict: brief.conflicts.length > 0,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
    assessment: assessmentJudgement,
  }
  let journey = presentCaseJourney(facts, now, events, journeyOptions)
  const selectedId = selectJourneyStep(journey, query.step)
  const selected = journey.steps.find(step => step.id === selectedId)
  const documentsOpen = selected?.id === "REQUEST_DOCUMENTS" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const evidenceOpen = selected?.id === "EVIDENCE_REVIEW" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const emailReadinessOpen = selected?.id === "CASE_RECEIVED" || selected?.id === "VERIFICATION"
  const communications = documentsOpen || emailReadinessOpen ? await loadCaseCommunications(detail.id) : null
  const readyBrief = {
    ...brief,
    customerId: detail.customerId,
    emailSuppressed: communications ? communications.verifiedEmailSuppressed : null,
  }
  const documents = documentsOpen
    ? buildJourneyDocuments({
      caseType: detail.type,
      issue: brief.snapshot?.details || brief.message,
      businessName: detail.business,
      requests: (await getEvidenceCase(detail.id)).requests,
      history: communications,
      sendDisabledReason: sendDisabledReason(),
      drafting: {
        customerOriginConfigured: Boolean(authConfig()?.customerOrigin),
        uploadLinkConfigured: linkSecret() !== null,
        senderConfigured: mailFromAddress() !== null,
      },
    })
    : null
  const evidenceReview = evidenceOpen ? await loadEvidenceReview(detail, facts, now) : null
  const quoteOpen = selected?.id === "QUOTE_ACCEPTANCE" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const quote = quoteOpen ? await loadJourneyQuote(facts, now, assessmentJudgement) : null
  const activationOpen = selected?.id === "SERVICE_ACTIVATION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const activation = activationOpen ? await loadJourneyActivation(facts, now, {
    recordConflict: brief.conflicts.length > 0,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
  }) : null
  const preparationOpen = selected?.id === "PREPARATION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const preparation = preparationOpen ? await loadJourneyPreparation(facts, journeyOptions.recordConflict || journeyOptions.emailRecordsDisagree || journeyOptions.authorityRecordsDisagree) : null
  if (preparation?.disagreed) {
    journey = presentCaseJourney(facts, now, events, { ...journeyOptions, packRecordsDisagree: true })
  }
  const submissionOpen = selected?.id === "SUBMISSION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const submission = submissionOpen ? loadJourneySubmission(facts, detail) : null
  if (submission?.disagreed) {
    journey = presentCaseJourney(facts, now, events, { ...journeyOptions, submissionRecordsDisagree: true })
  }
  const outcomeOpen = journey.steps.find(step => step.id === "OUTCOME_BILLING")
  const outcomeSelected = selectedId === "OUTCOME_BILLING" && outcomeOpen?.state !== "LOCKED" && outcomeOpen?.state !== "NOT_APPLICABLE"
  const outcome = outcomeSelected ? await loadJourneyOutcome(facts, detail, now) : null
  if (outcome?.disagreed) {
    journey = presentCaseJourney(facts, now, events, { ...journeyOptions, outcomeRecordsDisagree: true })
  }
  return <CaseJourneyView
    reference={detail.reference}
    customer={detail.client}
    business={detail.business}
    caseId={detail.id}
    journey={journey}
    selectedId={selectedId}
    brief={readyBrief}
    version={detail.version}
    documents={documents}
    replyMailbox={monitoredReplyMailbox()}
    evidenceReview={evidenceReview}
    assessment={assessment}
    quote={quote}
    activation={activation}
    preparation={preparation?.panel ?? null}
    submission={submission ? { caseDetail: detail, panel: submission.panel } : null}
    outcome={outcome?.panel ?? null}
    customerId={detail.customerId}
    businessId={detail.businessId}
    locationId={detail.locationId}
  />
}

/**
 * The same evidence reading the evidence page uses.
 * Pack rows stay out of this step. `hasPack` is false so an empty request
 * list is not hidden behind a pack that belongs to a later step.
 */
async function loadJourneyQuote(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  now: string,
  assessment: ReturnType<typeof judgeAssessment> | null,
) {
  const commercial = summariseCommercial(facts, now)
  const quoteId = commercial.quote?.id ?? null
  const [catalogue, quote] = await Promise.all([
    loadCatalogue(),
    quoteId ? loadQuote(quoteId) : Promise.resolve(null),
  ])
  return buildJourneyQuotePanel({
    facts,
    now,
    assessment,
    prices: catalogue.prices,
    quote,
    quoteDetailMissing: !!quoteId && quote?.id !== quoteId,
  })
}

async function loadJourneyActivation(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  now: string,
  conflicts: { recordConflict: boolean; emailRecordsDisagree: boolean; authorityRecordsDisagree: boolean },
) {
  const commercial = summariseCommercial(facts, now)
  const orderId = commercial.quote?.orderId ?? null
  const [order, money, authorization] = await Promise.all([
    orderId ? loadOrder(orderId) : Promise.resolve(null),
    loadMoney(),
    facts.serviceTrack === "MANAGED" ? getCaseAuthorization(facts.caseId) : Promise.resolve(null),
  ])
  return buildJourneyActivationPanel({
    facts,
    now,
    order,
    orderDetailMissing: !!orderId && order?.id !== orderId,
    moneyOrders: money.orders,
    authorization,
    recordsConflict: conflicts.recordConflict || conflicts.emailRecordsDisagree || conflicts.authorityRecordsDisagree,
  })
}

async function loadJourneyOutcome(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  detail: Awaited<ReturnType<typeof getCase>>,
  now: string,
) {
  const orderId = activationOrderLink(facts, now).quoteOrderId
  const [money, order] = await Promise.all([
    loadMoney(),
    orderId ? loadOrder(orderId) : Promise.resolve(null),
  ])
  return presentJourneyOutcome({
    facts,
    now,
    order,
    orderDetailMissing: !!orderId && order?.id !== orderId,
    recorded: {
      submissions: detail.submissions,
      caseTrack: detail.track,
      caseOutcome: detail.outcome,
      caseStatus: detail.status,
      moneyOrders: money.orders,
    },
  })
}

function loadJourneySubmission(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  detail: Awaited<ReturnType<typeof getCase>>,
) {
  return {
    disagreed: submissionRecordsDisagree(facts, detail.submissions, detail.track),
    panel: buildJourneySubmissionPanel({
      facts,
      submissions: detail.submissions,
      status: detail.status,
      track: detail.track,
      stage: detail.stage,
    }),
  }
}

async function loadJourneyPreparation(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  recordsConflict: boolean,
) {
  const packs = await getPreparedPackCase(facts.caseId)
  return {
    disagreed: preparationRecordsDisagree(facts, packs),
    panel: buildJourneyPreparationPanel({ facts, packs, recordsConflict }),
  }
}

async function loadEvidenceReview(
  detail: Awaited<ReturnType<typeof getCase>>,
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  now: string,
) {
  const evidence = await getEvidenceCase(detail.id)
  const packs: PreparedPackCase = { caseId: detail.id, packs: [], eligible: [] }
  const flow = resolveCaseFlow(facts, now)
  return {
    caseDetail: detail,
    evidence,
    packs,
    model: buildEvidenceWorkspaceModel({
      evidence,
      evidenceFacts: facts.evidence,
      communications: facts.communications,
      primaryAction: flow.primaryAction,
      now,
      hasPack: false,
    }),
  }
}
