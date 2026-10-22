import Link from "next/link"
import type { CaseDestination } from "@/lib/case-flow/destinations"
import type { CaseBlocker, CaseNextAction } from "@/lib/case-flow/model"
import { actionStatePresentation, actionTarget, caseStatusLabel, ownerSentence, serviceTrackLabels } from "../../presentation"
import { Badge } from "../../../ui"
import { journeyStep, type JourneyStepId } from "@/lib/case-journey/catalogue"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import {
  journeyStatePresentation,
  type CaseJourneyPresentation,
  type JourneyStepState,
  type JourneyStepView,
} from "@/lib/case-journey/present"
import type { CaseAssessmentView } from "@/lib/case-journey/assessment"
import type { JourneyDocuments } from "@/lib/case-journey/documents"
import type { CaseDetail } from "@/lib/cases/model"
import type { EvidenceCase } from "@/lib/evidence/model"
import type { EvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import type { PreparedPackCase } from "@/lib/packs/model"
import { AssessmentPanel } from "./assessment"
import { QuotePanel } from "./quote"
import type { JourneyQuotePanel } from "@/lib/case-journey/quote"
import { ActivationPanel } from "./activation"
import type { JourneyActivationPanel } from "@/lib/case-journey/activation"
import { PreparationPanel } from "./preparation"
import type { JourneyPreparationPanel } from "@/lib/case-journey/preparation"
import { SubmissionPanel } from "./submission"
import type { JourneySubmissionPanel } from "@/lib/case-journey/submission"
import { OutcomePanel } from "./outcome"
import type { JourneyOutcomePanel } from "@/lib/case-journey/outcome"
import { ClosurePanel } from "./closure"
import type { JourneyClosurePanel } from "@/lib/case-journey/closure"
import { DocumentRequestPanel } from "./documents"
import { EvidenceWorkspace } from "../evidence/workspace-view"
import { IntakeSummary, VerificationForm, VerificationSummary, IntakeReviewForm } from "./forms"

const partyLabels = {
  ADMIN: "ProfileRelaunch",
  CUSTOMER: "The customer",
  GOOGLE: "Google",
  ADMIN_AND_CUSTOMER: "ProfileRelaunch and the customer",
} as const

const stateClass: Record<JourneyStepState, string> = {
  COMPLETED: "guided-step-complete",
  CURRENT: "guided-step-current",
  LOCKED: "guided-step-locked",
  WAITING: "guided-step-waiting",
  NEEDS_ATTENTION: "guided-step-attention",
  NOT_APPLICABLE: "guided-step-na",
  UNKNOWN: "guided-step-unknown",
}

const previewNote: Record<JourneyStepId, string> = {
  CASE_RECEIVED: "Read the enquiry, then record whether it is reviewed or incomplete.",
  VERIFICATION: "Check the business and listing, then record the screening outcome.",
  REQUEST_DOCUMENTS: "Choose the documents, save one request, then edit and approve the email. Approving does not send it.",
  EVIDENCE_REVIEW: "Review each uploaded file. A clean scan is not approval, and accepting a file does not fulfil its request.",
  ASSESSMENT: "Record the findings and the recommended pathway, then review and approve them. Saving the form does not complete this step.",
  QUOTE_ACCEPTANCE: "Prepare and offer the quote with the existing commercial commands. Only an accepted quote on a complete list finishes this step.",
  SERVICE_ACTIVATION: "Guided activation is the settled upfront payment. Managed activation is the accepted order and the authorisation record. A saved card is not required.",
  PREPARATION: "Assemble the pack from accepted evidence, approve it, then publish it. Approval does not publish, and publication does not submit to Google.",
  SUBMISSION: "Record a submission that was already completed outside this portal, then its decision or withdrawal. Recording it does not submit it to Google.",
  OUTCOME_BILLING: "Verify the recorded outcome and the billing position. This step does not close the case or take a payment.",
  CLOSURE: "Close the case with the outcome already recorded. Optional Guard is not required.",
}

export type JourneyEvidenceReview = {
  caseDetail: CaseDetail
  evidence: EvidenceCase
  packs: PreparedPackCase
  model: EvidenceWorkspaceModel
}

/**
 * The eleven-step case workflow. Steps 1 and 2 record a staff decision.
 * Steps 3 and 4 reuse the existing document and evidence commands.
 * Step 5 records an assessment. Step 6 reuses the existing quote commands.
 * Step 7 reuses the existing payment-link and authorisation commands.
 * Step 8 reuses the existing prepared-pack commands.
 * Step 9 reuses the existing external-submission commands.
 * Step 10 reuses the existing success-fee approval and TEST-MODE hosted invoice.
 * Step 11 reuses the existing close and reopen commands. Guard stays optional.
 */
export function CaseJourneyView({
  reference,
  customer,
  business,
  caseId,
  journey,
  selectedId,
  brief,
  version,
  documents,
  replyMailbox = null,
  evidenceReview = null,
  assessment = null,
  quote = null,
  activation = null,
  preparation = null,
  submission = null,
  outcome = null,
  closure = null,
  customerId = "",
  businessId = "",
  locationId = null,
  developmentQuotationMail = false,
}: {
  reference: string
  customer: string
  business: string
  caseId: string
  customerId?: string
  businessId?: string
  locationId?: string | null
  journey: CaseJourneyPresentation
  selectedId: string
  brief: JourneyIntakeBrief
  version: number
  documents: JourneyDocuments | null
  replyMailbox?: string | null
  evidenceReview?: JourneyEvidenceReview | null
  assessment?: CaseAssessmentView | null
  quote?: JourneyQuotePanel | null
  activation?: JourneyActivationPanel | null
  preparation?: JourneyPreparationPanel | null
  submission?: { caseDetail: CaseDetail; panel: JourneySubmissionPanel } | null
  outcome?: { caseDetail: CaseDetail; panel: JourneyOutcomePanel } | null
  closure?: { caseDetail: CaseDetail; panel: JourneyClosurePanel } | null
  developmentQuotationMail?: boolean
}) {
  const selected = journey.steps.find(step => step.id === selectedId) ?? journey.steps[0]
  const status = caseStatusLabel(journey.caseStatus)
  return <section className="page guided-workflow">
    <Link className="back-link" href={`/cases/${caseId}?view=details`}>Case details</Link>
    <header className="page-header cockpit-header">
      <div>
        <p className="eyebrow">Case workflow</p>
        <h1>{reference}</h1>
        <p className="cockpit-parties">{customer} — {business}</p>
        <p className="badge-row">
          <Badge tone={status.tone}>{status.word}</Badge>
          <Badge tone="neutral">Service: {serviceTrackLabels[journey.serviceTrack]}</Badge>
          {journey.reopened && <Badge tone="warning">Reopened</Badge>}
        </p>
      </div>
    </header>
    {journey.attention.length > 0 && <section className="panel guided-warning" aria-labelledby="journey-attention-heading">
      <h2 id="journey-attention-heading">Needs attention</h2>
      <ul className="notice-list">{journey.attention.map(item => <li key={item.code}>
        <h3>{item.title}</h3>
        <p>{item.explanation}</p>
      </li>)}</ul>
    </section>}
    {journey.blockers.length > 0 && <section className="panel guided-warning" aria-labelledby="journey-blockers-heading">
      <h2 id="journey-blockers-heading">Blockers</h2>
      <ul className="notice-list">{journey.blockers.map(item => <Blocker key={item.code} blocker={item} />)}</ul>
    </section>}

    <div className="guided-workflow-layout">
      <StepWorkspace step={selected} journey={journey} brief={brief} caseId={caseId} customerId={customerId} businessId={businessId} locationId={locationId} customer={customer} business={business} version={version} reference={reference} documents={documents} replyMailbox={replyMailbox} evidenceReview={evidenceReview} assessment={assessment} quote={quote} activation={activation} preparation={preparation} submission={submission} outcome={outcome} closure={closure} developmentQuotationMail={developmentQuotationMail} />
      <nav className="guided-nav" aria-label="Eleven-step case workflow">
        <ol className="guided-steps">
          {journey.steps.map(step => {
            const presentation = journeyStatePresentation[step.state]
            const current = step.focus ? "step" : undefined
            return <li
              key={step.id}
              className={`guided-step ${stateClass[step.state]}${step.state === "LOCKED" ? " is-quiet" : ""}${step.focus ? " is-focus" : ""}${step.id === selected.id ? " is-selected" : ""}`}
              data-state={step.state}
              data-step={step.id}
            >
              <Link href={`/cases/${caseId}/journey?step=${step.id}`} aria-current={current} aria-label={`${step.order}. ${step.title}. ${presentation.label}`}>
                <span className="guided-step-mark" aria-hidden="true">{presentation.symbol}</span>
                <span className="guided-step-order">{step.order}</span>
                <span className="guided-step-title">{step.title}</span>
                {step.state !== "LOCKED" && <span className="guided-step-state">{presentation.label}</span>}
              </Link>
            </li>
          })}
        </ol>
      </nav>
    </div>
    <SystemDetails journey={journey} caseId={caseId} />
  </section>
}

function StepWorkspace({
  step,
  journey,
  brief,
  caseId,
  customerId,
  businessId,
  locationId,
  customer,
  business,
  version,
  reference,
  documents,
  replyMailbox,
  evidenceReview,
  assessment,
  quote,
  activation,
  preparation,
  submission,
  outcome,
  closure,
  developmentQuotationMail,
}: {
  step: JourneyStepView
  journey: CaseJourneyPresentation
  brief: JourneyIntakeBrief
  caseId: string
  customerId: string
  businessId: string
  locationId: string | null
  customer: string
  business: string
  version: number
  reference: string
  documents: JourneyDocuments | null
  replyMailbox: string | null
  evidenceReview: JourneyEvidenceReview | null
  assessment: CaseAssessmentView | null
  quote: JourneyQuotePanel | null
  activation: JourneyActivationPanel | null
  preparation: JourneyPreparationPanel | null
  submission: { caseDetail: CaseDetail; panel: JourneySubmissionPanel } | null
  outcome: { caseDetail: CaseDetail; panel: JourneyOutcomePanel } | null
  closure: { caseDetail: CaseDetail; panel: JourneyClosurePanel } | null
  developmentQuotationMail: boolean
}) {
  const intakeReviewed = journey.steps.find(item => item.id === "CASE_RECEIVED")?.state === "COMPLETED"
  const recordsAgree = brief.emailControl !== "records_disagree" && brief.authority !== "records_disagree" && brief.conflicts.length === 0
  const canRecord = step.state !== "LOCKED" && step.state !== "COMPLETED" && step.state !== "NOT_APPLICABLE"
  const showIntakeForm = step.decision === "intake" && canRecord
  const showVerificationForm = step.decision === "verification" && canRecord && intakeReviewed
  const showAmend = step.state === "COMPLETED" && (step.decision === "intake" || (step.decision === "verification" && intakeReviewed))
  const showDocuments = step.id === "REQUEST_DOCUMENTS" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && documents !== null
  const showEvidence = step.id === "EVIDENCE_REVIEW" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && evidenceReview !== null
  const showAssessment = step.id === "ASSESSMENT" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE"
  const showQuote = step.id === "QUOTE_ACCEPTANCE" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && quote !== null
  const showActivation = step.id === "SERVICE_ACTIVATION" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && activation !== null
  const showPreparation = step.id === "PREPARATION" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && preparation !== null
  const showSubmission = step.id === "SUBMISSION" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && submission !== null
  const showOutcome = step.id === "OUTCOME_BILLING" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && outcome !== null
  const showClosure = step.id === "CLOSURE" && step.state !== "LOCKED" && step.state !== "NOT_APPLICABLE" && closure !== null
  const guidedCommand = step.id === "REQUEST_DOCUMENTS" || step.id === "EVIDENCE_REVIEW" || step.id === "ASSESSMENT" || step.id === "QUOTE_ACCEPTANCE" || step.id === "SERVICE_ACTIVATION" || step.id === "PREPARATION" || step.id === "SUBMISSION" || step.id === "OUTCOME_BILLING" || step.id === "CLOSURE"
  const showMissing = step.missing.length > 0 && step.state !== "COMPLETED" && step.state !== "LOCKED" && !showDocuments && !showEvidence && !showAssessment && !showActivation && !showPreparation && !showSubmission && !showOutcome && !showClosure && (step.state === "NEEDS_ATTENTION" || (!showIntakeForm && !showVerificationForm))
  return <article className="panel guided-workspace" aria-labelledby="journey-step-heading">
    <p className="eyebrow">Step {step.order} of 11</p>
    <h2 id="journey-step-heading">{step.title}</h2>
    <p className="badge-row"><Badge tone={toneFor(step.state)}>{journeyStatePresentation[step.state].label}</Badge></p>
    <p className="guided-instruction">{instructionFor(step, journey)}</p>
    {step.unavailableReason && <p className="notice">{step.unavailableReason}</p>}
    {showMissing && <div className="guided-warning">
      <p><strong>What is preventing completion</strong></p>
      <ul>{step.missing.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
    {step.decision === "intake" && <IntakeSummary brief={brief} reference={reference} />}
    {step.decision === "verification" && <VerificationSummary brief={brief} caseId={caseId} />}
    {showIntakeForm && <IntakeReviewForm caseId={caseId} version={version} />}
    {showVerificationForm && <VerificationForm caseId={caseId} version={version} canComplete={recordsAgree} recordedWebsite={brief.website} recordedProfileUrl={brief.profileUrl} />}
    {showAmend && <details className="guided-details">
      <summary>Amend recorded decision</summary>
      {step.decision === "intake" && <IntakeReviewForm caseId={caseId} version={version} />}
      {step.decision === "verification" && <VerificationForm caseId={caseId} version={version} canComplete={recordsAgree} recordedWebsite={brief.website} recordedProfileUrl={brief.profileUrl} />}
    </details>}
    {showDocuments && <DocumentRequestPanel caseId={caseId} documents={documents} replyMailbox={replyMailbox} />}
    {step.id === "EVIDENCE_REVIEW" && !showEvidence && step.state !== "NOT_APPLICABLE" && <Outstanding step={step} />}
    {showEvidence && evidenceReview && <EvidenceReview step={step} review={evidenceReview} />}
    {showAssessment && <AssessmentPanel caseId={caseId} version={version} assessment={assessment} stepState={step.state} />}
    {showQuote && quote && <QuotePanel
      panel={quote}
      caseId={caseId}
      customerId={customerId}
      businessId={businessId}
      locationId={locationId}
      customerName={customer}
      businessName={business}
      listingCountry={brief.country}
      developmentQuotationMail={developmentQuotationMail}
    />}
    {showActivation && activation && <ActivationPanel caseId={caseId} panel={activation} />}
    {showPreparation && preparation && <PreparationPanel caseId={caseId} panel={preparation} />}
    {showSubmission && submission && <SubmissionPanel caseDetail={submission.caseDetail} panel={submission.panel} />}
    {showOutcome && outcome && <OutcomePanel caseDetail={outcome.caseDetail} panel={outcome.panel} />}
    {showClosure && closure && <ClosurePanel caseDetail={closure.caseDetail} panel={closure.panel} />}
    {!step.decision && !showDocuments && !showEvidence && !showAssessment && !showQuote && !showActivation && !showPreparation && !showSubmission && !showOutcome && !showClosure && <Destination destination={step.destination} />}
    <details className="guided-details">
      <summary>Additional details</summary>
      <h3>What is already known</h3>
      <ul>{step.known.map(item => <li key={item}>{item}</li>)}</ul>
      <h3>What remains required</h3>
      {step.missing.length === 0 ? <p>Nothing further is required for this step.</p> : <ul>{step.missing.map(item => <li key={item}>{item}</li>)}</ul>}
      <h3>Who must act</h3>
      <p>{step.whoMustAct}</p>
      <p>The catalogue names {partyLabels[step.responsibleParty]} as the responsible party for this step.</p>
      <h3>What unlocks the next step</h3>
      <p>{step.unlock}</p>
      <h3>Completion evidence</h3>
      <p>{journeyStep(step.id).completionEvidence}</p>
      <h3>{step.decision ? "What this form does not do" : "What this step does not do"}</h3>
      <p>{step.unsupported}</p>
      {step.decision
        ? <p>This form records the staff decision for {step.laterWork}. It does not send email, take a payment, or change the technical stage.</p>
        : step.id === "REQUEST_DOCUMENTS"
          ? <p>Saving a requirement, editing the wording, and approving the email do not send it. An approved email does not complete this step.</p>
          : step.id === "EVIDENCE_REVIEW"
            ? <p>Refreshing a scan, opening a cleared file, accepting, rejecting and fulfilling a request use the existing evidence commands. An upload is not acceptance. A clean scan is not approval. Accepting a file does not fulfil its request. This step does not send email, take a payment, or record that no documents are required.</p>
            : step.id === "ASSESSMENT"
              ? <p>Saving a draft, submitting it for review, or approving it does not send email, take a payment, submit anything to Google, accept a quote, or activate a service. A recommended Guided or Managed pathway is not an accepted service agreement. A suspended or missing listing does not block the assessment. The step is complete only while the latest approval still matches the case, the profile, and the evidence, and the case has not been reopened.</p>
              : step.id === "QUOTE_ACCEPTANCE"
                ? <p>Preparing, reviewing, offering or issuing an acceptance link uses the existing quote commands. None of those accepts the quote. A recommended pathway is not an agreement by the customer and this step does not change the selected service track. Offering a binding paid quote still requires the purchasing establishment and the country and tax eligibility checks. This step does not take a payment, activate the service, send email, or submit anything to Google.</p>
                : step.id === "SERVICE_ACTIVATION"
                  ? <p>Issuing a payment link or an authorisation link uses the existing commands. Neither marks an obligation paid, grants Google access, prepares a pack, or submits anything to Google. A saved card is not required for Managed activation. Live payment collection stays on the existing provider gate.</p>
                  : step.id === "PREPARATION"
                    ? <p>Creating a draft, changing its evidence, approving it, and publishing or unpublishing it use the existing pack commands. Approval does not publish the pack. Publication does not submit anything to Google and does not create an open document link. An unscanned, rejected, superseded or unlinked file is not offered.</p>
                    : step.id === "SUBMISSION"
                      ? <p>Recording an attempt, a decision or a withdrawal uses the existing case commands. None of those submits anything to Google. A Guided attempt is the customer&apos;s and a Managed attempt is ProfileRelaunch&apos;s. An open attempt does not finish this step. Outcome review, billing and closure stay on later steps.</p>
                      : step.id === "OUTCOME_BILLING"
                        ? <p>Recording an outcome uses the case command. It does not close the case, change the stage, or set a closure date. Success-fee approval and a TEST-MODE hosted invoice use the existing payment commands. Neither marks an obligation paid, charges a card, or closes the case. Recording an outcome does not approve a fee, create an invoice, or take a payment. Agreement PS-2026-10-14.2 does not collect a Managed success fee in advance.</p>
                        : step.id === "CLOSURE"
                          ? <p>Closing and reopening use the existing case commands. Closing repeats a recorded outcome and summary exactly. It does not send email, submit anything to Google, collect a payment, or enrol Guard. A withdrawal stays CANCELLED. The step is complete only when the status, outcome, summary and finished stage agree, and the loaded case record matches that projection.</p>
                          : <p>The operation itself belongs to {step.laterWork}. This page does not perform it and has no button that pretends to.</p>}
      {(step.decision || guidedCommand) && step.destination && <p><Link href={step.destination.href}>Open {step.destination.label}</Link></p>}
    </details>
  </article>
}

function instructionFor(step: JourneyStepView, journey: CaseJourneyPresentation): string {
  if (step.id === "CLOSURE" && step.state === "COMPLETED" && journey.caseStatus === "CANCELLED") return "This case is cancelled. The database status is CANCELLED. Optional Guard was not required."
  if (step.id === "CLOSURE" && step.state === "COMPLETED") return "This case is closed. The database status is CLOSED. Optional Guard was not required."
  if (step.id === "CLOSURE" && step.state === "NEEDS_ATTENTION" && !journey.closed) return "The loaded case record and the case-flow projection do not agree, so closure is not offered from here."
  if (step.id === "CLOSURE" && step.state === "NEEDS_ATTENTION") return "This closure record is inconsistent. The database status is shown for diagnosis. It is not a verified closure."
  if (step.id === "CLOSURE" && step.state === "LOCKED") return "Closure stays closed until the earlier steps are recorded."
  if (step.id === "CLOSURE" && journey.reopened) return "This case was reopened. Closure is not complete. The earlier outcome stays in the history."
  if (step.id === "CLOSURE") return "Close the case with the outcome already recorded. Optional Guard is not required."
  if (step.id === "ASSESSMENT" && step.state === "COMPLETED") return "This assessment is approved. It recommends a pathway. It is not an accepted agreement and the service is not activated."
  if (step.id === "QUOTE_ACCEPTANCE" && step.state === "COMPLETED") return "This quote is accepted. That is the customer's agreement. It does not activate the service and it does not take a payment."
  if (step.id === "OUTCOME_BILLING" && step.state === "COMPLETED") return "The outcome is recorded and the billing position agrees with it. Approval, an invoice link and a saved card are not what completed this step."
  if (step.id === "OUTCOME_BILLING" && step.state === "LOCKED") return "Outcome verification stays closed until the earlier steps are recorded."
  if (step.id === "OUTCOME_BILLING" && step.state === "WAITING") return "Billing is still open. An approval, an invoice link, a saved card or a checkout return is not settlement."
  if (step.id === "OUTCOME_BILLING" && step.state === "NEEDS_ATTENTION") return "The outcome or the billing record is not ready. A conflicting record does not finish this step, and an unsuccessful case is not invoiced to finish it."
  if (step.id === "SUBMISSION" && step.state === "COMPLETED") return "Every recorded attempt has a decision or a withdrawal. Recording those results did not submit anything to Google."
  if (step.id === "SUBMISSION" && step.state === "LOCKED") return "Submission tracking stays closed until the earlier steps are recorded."
  if (step.id === "SUBMISSION" && step.state === "WAITING") return "An attempt is recorded and is still waiting for a decision. That record is not a submission to Google."
  if (step.id === "SUBMISSION" && step.state === "NEEDS_ATTENTION") return "This submission record is not ready. A conflicting record, the wrong submitting party, or an unrecognised result does not finish the step."
  if (step.id === "PREPARATION" && step.state === "COMPLETED") return "This pack is the current approved and published pack. Approval alone did not finish the step, and publication did not submit anything to Google."
  if (step.id === "PREPARATION" && step.state === "LOCKED") return "Case preparation stays closed until the earlier steps are recorded."
  if (step.id === "PREPARATION" && step.state === "NEEDS_ATTENTION") return "This pack is not ready. A stale pack, a conflicting record, or more than one published pack does not finish the step."
  if (step.id === "SERVICE_ACTIVATION" && step.state === "COMPLETED") return "This service is activated from the recorded payment or authorisation. A checkout return, a saved card, and the selected track are not what completed it."
  if (step.id === "SERVICE_ACTIVATION" && step.state === "LOCKED") return "Service activation stays closed until the earlier steps are recorded."
  if (step.id === "SERVICE_ACTIVATION" && step.state === "NEEDS_ATTENTION") return "Activation is not recorded. A failed payment, an expired link, a revoked permission, or disagreeing records do not activate the service."
  if (step.id === "SERVICE_ACTIVATION" && step.state === "WAITING") return "The customer still has to pay or accept the authorisation. An open link is not activation."
  if (step.id === "QUOTE_ACCEPTANCE" && step.state === "LOCKED") return "Quote and acceptance stay closed until the earlier steps are recorded."
  if (step.id === "QUOTE_ACCEPTANCE" && step.state === "NEEDS_ATTENTION") return "This quote is not accepted. A declined, expired or incomplete record is not the customer's agreement."
  if (step.id === "QUOTE_ACCEPTANCE" && step.state === "WAITING") return "The customer still has to accept the quote. An open link is not acceptance."
  if (step.state === "COMPLETED" && step.decision === "intake") return "This intake review is recorded."
  if (step.state === "COMPLETED" && step.decision === "verification") return "Preliminary screening is recorded."
  if (step.state === "COMPLETED") return "This step is complete."
  if (step.id === "VERIFICATION" && step.state === "NEEDS_ATTENTION") return "Screening cannot be completed until the conflict below is resolved."
  if (step.id === "CASE_RECEIVED" && step.state === "NEEDS_ATTENTION") return "The intake is not reviewed. Record the outcome and the next action."
  if (step.state === "LOCKED" && step.decision === "verification") return "Business verification starts after the intake review is recorded."
  if (step.id === "REQUEST_DOCUMENTS" && step.state === "LOCKED") return "Document requests stay closed until the earlier steps are recorded."
  if (step.id === "REQUEST_DOCUMENTS" && step.state === "WAITING") return "The message is waiting on the email provider. That is not delivery."
  if (step.id === "EVIDENCE_REVIEW" && step.state === "LOCKED") return "Evidence review stays closed until the earlier steps are recorded."
  if (step.id === "EVIDENCE_REVIEW" && step.state === "WAITING") return "The customer still has to send the documents. Delivery of the request is not a review."
  if (step.id === "EVIDENCE_REVIEW" && step.state === "NEEDS_ATTENTION") return "A file or request needs attention. The original record stays as it was recorded."
  if (step.id === "EVIDENCE_REVIEW" && step.state === "UNKNOWN") return "No evidence is on file. A decision that none is required has to be recorded separately."
  if (step.id === "ASSESSMENT" && step.state === "LOCKED") return "Assessment stays closed until the earlier steps are recorded."
  if (step.id === "ASSESSMENT" && step.state === "NEEDS_ATTENTION") return "This approval is not current. A new draft has to be reviewed and approved."
  return previewNote[step.id]
}

function Outstanding({ step }: { step: JourneyStepView }) {
  return <div className="guided-warning">
    <p><strong>What remains outstanding</strong></p>
    {step.missing.length === 0
      ? <p>Nothing further is required for this step.</p>
      : <ul>{step.missing.map(item => <li key={item}>{item}</li>)}</ul>}
    <p><strong>Who must act</strong></p>
    <p>{step.whoMustAct}</p>
  </div>
}

function EvidenceReview({ step, review }: { step: JourneyStepView; review: JourneyEvidenceReview }) {
  return <div className="evidence-workspace">
    {step.state !== "COMPLETED" && <Outstanding step={step} />}
    <EvidenceWorkspace
      caseDetail={review.caseDetail}
      evidence={review.evidence}
      packs={review.packs}
      model={review.model}
      scope="review"
    />
  </div>
}

function Destination({ destination }: { destination: CaseDestination | null }) {
  if (!destination) return null
  return <p><Link href={destination.href}>Open {destination.label}</Link></p>
}

function SystemDetails({ journey, caseId }: { journey: CaseJourneyPresentation; caseId: string }) {
  return <details className="guided-details guided-system">
    <summary>System details</summary>
    <p>Technical stage: {journey.technicalStageLabel}. The stage shows where the case file sits. It does not complete a step.</p>
    {journey.projectionNote && <p>{journey.projectionNote}</p>}
    <h3>Case-flow recommendation</h3>
    {journey.suppressedAction
      ? <div>
        <p>The case-flow model currently names “{journey.suppressedAction.label}”.</p>
        <p>{journey.suppressedAction.reason}</p>
      </div>
      : journey.nextAction
        ? <Recommended action={journey.nextAction} caseId={caseId} />
        : <p>{terminalSentence(journey)}</p>}
    {journey.incompatibilities.filter(item => item !== journey.suppressedAction?.reason).map(item => <p key={item}>{item}</p>)}
  </details>
}

function terminalSentence(journey: CaseJourneyPresentation): string {
  const closure = journey.steps.find(step => step.id === "CLOSURE")
  if (journey.closed && closure?.state !== "COMPLETED") {
    return `The database status is ${journey.caseStatus}. The closure record is inconsistent, so the case-flow model has no next action.`
  }
  if (journey.caseStatus === "CANCELLED" && journey.closed) return "The case is cancelled, so the case-flow model has no next action."
  if (journey.closed) return "The case is closed, so the case-flow model has no next action."
  return "The case-flow model has no next action for this projection."
}

function Recommended({ action, caseId }: { action: CaseNextAction; caseId: string }) {
  const state = actionStatePresentation[action.state]
  const target = actionTarget(action, `/cases/${caseId}?view=details`)
  return <>
    <h3>{action.label}</h3>
    <p className="badge-row"><Badge tone={state.tone}>{state.word}</Badge></p>
    <p>{action.description}</p>
    <p className="cockpit-owner">{ownerSentence(action)}</p>
    {target && <p><Link href={target.href}>Open the existing place for this</Link></p>}
  </>
}

function Blocker({ blocker }: { blocker: CaseBlocker }) {
  return <li>
    <h3>{blocker.title}</h3>
    <p>{blocker.explanation}</p>
  </li>
}

function toneFor(state: JourneyStepState): "success" | "info" | "warning" | "neutral" {
  if (state === "COMPLETED") return "success"
  if (state === "CURRENT" || state === "WAITING") return "info"
  if (state === "NEEDS_ATTENTION" || state === "UNKNOWN") return "warning"
  return "neutral"
}
