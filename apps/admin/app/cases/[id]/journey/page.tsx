import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { attachSubmissionSources } from "@/lib/case-flow/evidence"
import { loadCaseFlowFacts } from "@/lib/case-flow/load"
import { resolveCaseFlow, summariseCommercial } from "@/lib/case-flow/resolve"
import { loadCatalogue, loadOrder, loadQuote } from "@/lib/commerce/queries"
import { buildJourneyQuotePanel } from "@/lib/case-journey/quote"
import { loadCaseQuoteReadiness } from "@/lib/case-journey/quote-readiness-command"
import { unavailableQuoteReadiness } from "@/lib/case-journey/quote-readiness"
import { emptyQuoteEmail, projectQuoteEmail } from "@/lib/case-journey/quote-email"
import { emptyPaymentRequestEmail, projectPaymentRequestEmail } from "@/lib/case-journey/payment-request-email"
import { acceptedOrderOutstandingLabel, acceptedServiceProjection, activationOrderLink, buildJourneyActivationPanel } from "@/lib/case-journey/activation"
import { buildJourneyPreparationPanel, preparationRecordsDisagree } from "@/lib/case-journey/preparation"
import { buildJourneySubmissionPanel, submissionRecordsDisagree } from "@/lib/case-journey/submission"
import { presentJourneyOutcome } from "@/lib/case-journey/outcome"
import { presentJourneyClosure } from "@/lib/case-journey/closure"
import { getCaseAuthorization } from "@/lib/authorization/queries"
import { loadMoney } from "@/lib/payments/queries"
import { loadSuccessVerification } from "@/lib/payments/success-fee-cases"
import { authConfig } from "@/lib/auth/config"
import { communicationsSendEnabled, sendDisabledReason } from "@/lib/communications/gate"
import { confirmedReplyMailbox } from "@/lib/communications/brand-email"
import { linkSecret } from "@/lib/communications/link"
import { mailFromAddress } from "@/lib/communications/mail"
import { monitoredReplyMailbox } from "@/lib/communications/brand-email"
import { loadCaseCommunications } from "@/lib/communications/queries"
import { judgeAssessment } from "@/lib/case-journey/assessment"
import { loadCaseAssessment } from "@/lib/case-journey/assessment-command"
import { devCaseJourneyPreviewEnabled } from "@/lib/case-journey/gate"
import { devAdminOutgoingMailLane } from "@/lib/communications/dev-lane"
import { buildJourneyDocuments } from "@/lib/case-journey/documents"
import { buildJourneyIntake } from "@/lib/case-journey/intake"
import { loadEmailConfirmationStatus } from "@/lib/case-journey/email-confirmation-status"
import { loadJourneyExtension } from "@/lib/case-journey/read"
import { presentCaseJourney, selectJourneyStep } from "@/lib/case-journey/present"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { EvidenceCase } from "@/lib/evidence/model"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { buildEvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import type { PreparedPackCase } from "@/lib/packs/model"
import { getPreparedPackCase } from "@/lib/packs/queries"
import { getMembership, recordDetail } from "@/lib/records/queries"
import { requireStaff } from "@/lib/require-staff"
import { CaseJourneyView } from "./view"

export const metadata = { title: "Case workflow" }

/**
 * Eleven-step case workflow.
 *
 * The environment check runs before any case read, so Production and other
 * Preview branches never resolve a case through this route. Staff auth is
 * the same check the rest of Admin already uses. On the develop DEV Preview
 * this is the primary case page. It does not change a command or a case rule.
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
  const outcomeEvents = detail.events.map(event => ({
    id: event.id,
    event: event.event,
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
  const evidenceCase = facts.evidence.versions.length > 0 ? await getEvidenceCase(detail.id) : null
  const journeyFacts = evidenceCase ? factsWithSubmissionSources(facts, evidenceCase) : facts
  const assessmentJudgement = assessment ? judgeAssessment(assessment) : null
  const journeyOptions = {
    recordConflict: brief.conflicts.length > 0,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
    assessment: assessmentJudgement,
    outcomeEvents,
  }
  let journey = presentCaseJourney(journeyFacts, now, events, journeyOptions)
  const pendingAccepted = acceptedServiceProjection(journeyFacts, now)
  const acceptedOrder = pendingAccepted && !pendingAccepted.aligned ? await loadOrder(pendingAccepted.orderId) : null
  const acceptedOrderLabel = acceptedOrder ? acceptedOrderOutstandingLabel(acceptedOrder) : null
  const selectedId = selectJourneyStep(journey, query.step)
  const selected = journey.steps.find(step => step.id === selectedId)
  const documentsOpen = selected?.id === "REQUEST_DOCUMENTS" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const evidenceOpen = selected?.id === "EVIDENCE_REVIEW" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const emailReadinessOpen = selected?.id === "CASE_RECEIVED" || selected?.id === "VERIFICATION"
  const quoteOpen = selected?.id === "QUOTE_ACCEPTANCE" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const communications = documentsOpen || emailReadinessOpen || quoteOpen ? await loadCaseCommunications(detail.id) : null
  const confirmationStatus = emailReadinessOpen ? await loadEmailConfirmationStatus(detail.id) : null
  const readyBrief = {
    ...brief,
    customerId: detail.customerId,
    emailSuppressed: communications ? communications.verifiedEmailSuppressed : null,
    emailConfirmationPending: confirmationStatus?.state === "pending" && confirmationStatus.provenance === "initial_receipt",
    emailConfirmationState: confirmationStatus?.state,
    emailConfirmationProvenance: confirmationStatus?.provenance,
    emailConfirmationRecovery: confirmationStatus?.recovery,
  }
  const documents = documentsOpen
    ? buildJourneyDocuments({
      caseType: detail.type,
      issue: brief.snapshot?.details || brief.message,
      businessName: detail.business,
      requests: (evidenceCase ?? await getEvidenceCase(detail.id)).requests,
      history: communications,
      sendDisabledReason: sendDisabledReason(),
      sendManuallyOnDev: devAdminOutgoingMailLane(),
      drafting: {
        customerOriginConfigured: Boolean(authConfig()?.customerOrigin),
        uploadLinkConfigured: linkSecret() !== null,
        senderConfigured: mailFromAddress() !== null,
      },
    })
    : null
  const evidenceReview = evidenceOpen ? await loadEvidenceReview(detail, journeyFacts, now, evidenceCase) : null
  const quote = quoteOpen ? await loadJourneyQuote(facts, now, assessmentJudgement) : null
  const quoteReadiness = quoteOpen ? await loadCaseQuoteReadiness(detail.id) : unavailableQuoteReadiness
  const quoteEmail = quoteOpen
    ? projectQuoteEmail(communications, quote?.quote?.actionId ?? null, { devSend: devAdminOutgoingMailLane() })
    : emptyQuoteEmail
  const quoteConfirmation = quoteOpen && !facts.authorization.customerEmailVerified
    ? await loadEmailConfirmationStatus(detail.id)
    : null
  const quoteEmailRecovery = quoteConfirmation?.recovery === "send" || quoteConfirmation?.recovery === "resend"
    ? quoteConfirmation.recovery
    : null
  const activationOpen = selected?.id === "SERVICE_ACTIVATION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const activationCommunications = activationOpen ? await loadCaseCommunications(detail.id) : null
  const paymentEmail = activationOpen
    ? projectPaymentRequestEmail(activationCommunications, detail.reference, { devSend: devAdminOutgoingMailLane() })
    : emptyPaymentRequestEmail
  const activation = activationOpen ? await loadJourneyActivation(facts, now, {
    recordConflict: brief.conflicts.length > 0,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
  }) : null
  const preparationOpen = selected?.id === "PREPARATION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const preparation = preparationOpen ? await loadJourneyPreparation(facts, journeyOptions.recordConflict || journeyOptions.emailRecordsDisagree || journeyOptions.authorityRecordsDisagree) : null
  if (preparation?.disagreed) {
    journey = presentCaseJourney(journeyFacts, now, events, { ...journeyOptions, packRecordsDisagree: true })
  }
  const submissionOpen = selected?.id === "SUBMISSION" && selected.state !== "LOCKED" && selected.state !== "NOT_APPLICABLE"
  const submission = submissionOpen ? loadJourneySubmission(facts, detail) : null
  if (submission?.disagreed) {
    journey = presentCaseJourney(journeyFacts, now, events, { ...journeyOptions, submissionRecordsDisagree: true })
  }
  const outcomeOpen = journey.steps.find(step => step.id === "OUTCOME_BILLING")
  const outcomeSelected = selectedId === "OUTCOME_BILLING" && outcomeOpen?.state !== "LOCKED" && outcomeOpen?.state !== "NOT_APPLICABLE"
  const outcome = outcomeSelected ? await loadJourneyOutcome(facts, detail, now) : null
  if (outcome?.disagreed) {
    journey = presentCaseJourney(journeyFacts, now, events, { ...journeyOptions, outcomeRecordsDisagree: true })
  }
  const closureStep = journey.steps.find(step => step.id === "CLOSURE")
  const closureSelected = selectedId === "CLOSURE" && closureStep?.state !== "LOCKED" && closureStep?.state !== "NOT_APPLICABLE"
  const closure = closureSelected ? await loadJourneyClosure(facts, detail, now, journey) : null
  if (closure && (closure.disagreed || closure.closureRecordsDisagree)) {
    journey = presentCaseJourney(journeyFacts, now, events, {
      ...journeyOptions,
      ...(closure.disagreed ? { outcomeRecordsDisagree: true } : {}),
      ...(closure.closureRecordsDisagree ? { closureRecordsDisagree: true } : {}),
    })
  }
  const closureAfter = journey.steps.find(step => step.id === "CLOSURE")
  const closureVisible = closure && closureAfter?.state !== "LOCKED" && closureAfter?.state !== "NOT_APPLICABLE"
    ? presentJourneyClosure({
      ...closure.input,
      precedingComplete: journey.steps.filter(step => step.id !== "CLOSURE").every(step => step.state === "COMPLETED" || step.state === "NOT_APPLICABLE"),
    })
    : null
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
    quoteReadiness={quoteReadiness}
    quoteEmail={quoteEmail}
    paymentEmail={paymentEmail}
    activation={activation}
    acceptedOrderLabel={acceptedOrderLabel}
    preparation={preparation?.panel ?? null}
    submission={submission ? { caseDetail: detail, panel: submission.panel } : null}
    outcome={outcome ? { caseDetail: detail, panel: outcome.panel } : null}
    closure={closureVisible ? { caseDetail: detail, panel: closureVisible.panel } : null}
    customerId={detail.customerId}
    businessId={detail.businessId}
    locationId={detail.locationId}
    membership={membership}
    emailRecovery={quoteEmailRecovery}
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
    mailReady: communicationsSendEnabled() && mailFromAddress() != null && confirmedReplyMailbox() != null,
  })
}

async function loadJourneyOutcome(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  detail: Awaited<ReturnType<typeof getCase>>,
  now: string,
) {
  const orderId = activationOrderLink(facts, now).quoteOrderId
  const [money, order, verified] = await Promise.all([
    loadMoney(),
    orderId ? loadOrder(orderId) : Promise.resolve(null),
    loadSuccessVerification(orderId ? [orderId] : []),
  ])
  return presentJourneyOutcome({
    facts,
    now,
    order,
    orderDetailMissing: !!orderId && order?.id !== orderId,
    verificationReady: !!orderId && verified?.ready.has(orderId) === true,
    verificationKnown: verified !== null,
    baseline: orderId ? verified?.baselines.get(orderId) ?? null : null,
    checks: orderId ? verified?.checks.get(orderId) ?? [] : [],
    collectionPause: orderId ? verified?.pauses.get(orderId) ?? null : null,
    events: detail.events.map(event => ({ id: event.id, event: event.event, details: event.details })),
    recorded: {
      submissions: detail.submissions,
      caseTrack: detail.track,
      caseOutcome: detail.outcome,
      caseStatus: detail.status,
      moneyOrders: money.orders,
    },
  })
}

async function loadJourneyClosure(
  facts: Awaited<ReturnType<typeof loadCaseFlowFacts>>,
  detail: Awaited<ReturnType<typeof getCase>>,
  now: string,
  journey: ReturnType<typeof presentCaseJourney>,
) {
  const orderId = activationOrderLink(facts, now).quoteOrderId
  const [money, order, verified] = await Promise.all([
    loadMoney(),
    orderId ? loadOrder(orderId) : Promise.resolve(null),
    loadSuccessVerification(orderId ? [orderId] : []),
  ])
  const input = {
    facts,
    now,
    order,
    orderDetailMissing: !!orderId && order?.id !== orderId,
    events: detail.events.map(event => ({ id: event.id, event: event.event, details: event.details })),
    detail,
    recorded: {
      submissions: detail.submissions,
      caseTrack: detail.track,
      caseOutcome: detail.outcome,
      caseStatus: detail.status,
      moneyOrders: money.orders,
    },
    precedingComplete: journey.steps.filter(step => step.id !== "CLOSURE").every(step => step.state === "COMPLETED" || step.state === "NOT_APPLICABLE"),
    mailRecovery: communicationsSendEnabled() && confirmedReplyMailbox() != null,
    verificationReady: !!orderId && verified?.ready.has(orderId) === true,
  }
  const presented = presentJourneyClosure(input)
  return { disagreed: presented.disagreed, closureRecordsDisagree: presented.closureRecordsDisagree, input }
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
    panel: buildJourneyPreparationPanel({
      facts,
      packs,
      recordsConflict,
      mailRecovery: communicationsSendEnabled() && confirmedReplyMailbox() != null,
    }),
  }
}

function factsWithSubmissionSources(facts: CaseFlowFacts, evidence: EvidenceCase): CaseFlowFacts {
  return {
    ...facts,
    evidence: attachSubmissionSources(
      facts.evidence,
      evidence.documents.flatMap(document => document.versions.map(version => ({
        versionId: version.id,
        submissionSource: version.submissionSource === "CUSTOMER" || version.submissionSource === "ADMIN" ? version.submissionSource : null,
        evidenceRequestId: document.evidenceRequestId,
      }))),
    ),
  }
}

async function loadEvidenceReview(
  detail: Awaited<ReturnType<typeof getCase>>,
  facts: CaseFlowFacts,
  now: string,
  evidenceCase: EvidenceCase | null,
) {
  const evidence = evidenceCase ?? await getEvidenceCase(detail.id)
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
