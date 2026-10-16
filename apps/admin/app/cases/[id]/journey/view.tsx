import Link from "next/link"
import type { CaseDestination } from "@/lib/case-flow/destinations"
import type { CaseBlocker, CaseNextAction } from "@/lib/case-flow/model"
import { actionStatePresentation, actionTarget, caseStatusLabel, ownerSentence, serviceTrackLabels } from "../../presentation"
import { Badge, Notice } from "../../../ui"
import { journeyStep, type JourneyStepId } from "@/lib/case-journey/catalogue"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import {
  journeyStatePresentation,
  type CaseJourneyPresentation,
  type JourneyStepState,
  type JourneyStepView,
} from "@/lib/case-journey/present"
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
  REQUEST_DOCUMENTS: "Document-request actions are not available in this preview.",
  EVIDENCE_REVIEW: "Evidence review actions are not available in this preview.",
  ASSESSMENT: "Assessment actions are not available in this preview.",
  QUOTE_ACCEPTANCE: "Quote actions are not available in this preview.",
  SERVICE_ACTIVATION: "Service activation actions are not available in this preview.",
  PREPARATION: "Pack preparation actions are not available in this preview.",
  SUBMISSION: "Google submission is not available in this preview.",
  OUTCOME_BILLING: "Billing actions are not available in this preview.",
  CLOSURE: "Closure actions are not available in this preview.",
}

/**
 * The eleven-step preview. Steps 1 and 2 can record a staff decision.
 * Every other step still only links to a place that already exists.
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
}: {
  reference: string
  customer: string
  business: string
  caseId: string
  journey: CaseJourneyPresentation
  selectedId: string
  brief: JourneyIntakeBrief
  version: number
}) {
  const selected = journey.steps.find(step => step.id === selectedId) ?? journey.steps[0]
  const status = caseStatusLabel(journey.caseStatus)
  return <section className="page guided-workflow">
    <Link className="back-link" href={`/cases/${caseId}`}>Back to the case cockpit</Link>
    <Notice tone="warning">
      Development preview. This page does not replace the case cockpit, send email, or take a payment.
    </Notice>
    <header className="page-header cockpit-header">
      <div>
        <p className="eyebrow">Guided workflow</p>
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
      <StepWorkspace step={selected} journey={journey} brief={brief} caseId={caseId} version={version} reference={reference} />
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
  version,
  reference,
}: {
  step: JourneyStepView
  journey: CaseJourneyPresentation
  brief: JourneyIntakeBrief
  caseId: string
  version: number
  reference: string
}) {
  const intakeReviewed = journey.steps.find(item => item.id === "CASE_RECEIVED")?.state === "COMPLETED"
  const recordsAgree = brief.emailControl !== "records_disagree" && brief.authority !== "records_disagree" && brief.conflicts.length === 0
  const canRecord = step.state !== "LOCKED" && step.state !== "COMPLETED" && step.state !== "NOT_APPLICABLE"
  const showIntakeForm = step.decision === "intake" && canRecord
  const showVerificationForm = step.decision === "verification" && canRecord && intakeReviewed
  const showAmend = step.state === "COMPLETED" && (step.decision === "intake" || (step.decision === "verification" && intakeReviewed))
  const showMissing = step.missing.length > 0 && step.state !== "COMPLETED" && step.state !== "LOCKED" && (step.state === "NEEDS_ATTENTION" || (!showIntakeForm && !showVerificationForm))
  return <article className="panel guided-workspace" aria-labelledby="journey-step-heading">
    <p className="eyebrow">Step {step.order} of 11</p>
    <h2 id="journey-step-heading">{step.title}</h2>
    <p className="badge-row"><Badge tone={toneFor(step.state)}>{journeyStatePresentation[step.state].label}</Badge></p>
    <p className="guided-instruction">{instructionFor(step)}</p>
    {step.unavailableReason && <p className="notice">{step.unavailableReason}</p>}
    {showMissing && <div className="guided-warning">
      <p><strong>What is preventing completion</strong></p>
      <ul>{step.missing.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}
    {step.decision === "intake" && <IntakeSummary brief={brief} reference={reference} />}
    {step.decision === "verification" && <VerificationSummary brief={brief} />}
    {showIntakeForm && <IntakeReviewForm caseId={caseId} version={version} />}
    {showVerificationForm && <VerificationForm caseId={caseId} version={version} canComplete={recordsAgree} recordedWebsite={brief.website} recordedProfileUrl={brief.profileUrl} />}
    {showAmend && <details className="guided-details">
      <summary>Amend recorded decision</summary>
      {step.decision === "intake" && <IntakeReviewForm caseId={caseId} version={version} />}
      {step.decision === "verification" && <VerificationForm caseId={caseId} version={version} canComplete={recordsAgree} recordedWebsite={brief.website} recordedProfileUrl={brief.profileUrl} />}
    </details>}
    {!step.decision && <Destination destination={step.destination} />}
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
      <h3>{step.decision ? "What this form does not do" : "Not available in this preview"}</h3>
      <p>{step.unsupported}</p>
      {step.decision
        ? <p>This form records the staff decision for {step.laterWork}. It does not send email, take a payment, or change the technical stage.</p>
        : <p>The operation itself belongs to {step.laterWork}. This page does not perform it and has no button that pretends to.</p>}
      {step.decision && step.destination && <p><Link href={step.destination.href}>Open {step.destination.label}</Link></p>}
    </details>
  </article>
}

function instructionFor(step: JourneyStepView): string {
  if (step.state === "COMPLETED" && step.decision === "intake") return "This intake review is recorded."
  if (step.state === "COMPLETED" && step.decision === "verification") return "Preliminary screening is recorded."
  if (step.state === "COMPLETED") return "This step is complete."
  if (step.id === "VERIFICATION" && step.state === "NEEDS_ATTENTION") return "Screening cannot be completed until the conflict below is resolved."
  if (step.id === "CASE_RECEIVED" && step.state === "NEEDS_ATTENTION") return "The intake is not reviewed. Record the outcome and the next action."
  if (step.state === "LOCKED" && step.decision === "verification") return "Business verification starts after the intake review is recorded."
  return previewNote[step.id]
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
        : <p>{journey.closed ? "The case is closed, so the case-flow model has no next action." : "The case-flow model has no next action for this projection."}</p>}
    {journey.incompatibilities.filter(item => item !== journey.suppressedAction?.reason).map(item => <p key={item}>{item}</p>)}
  </details>
}

function Recommended({ action, caseId }: { action: CaseNextAction; caseId: string }) {
  const state = actionStatePresentation[action.state]
  const target = actionTarget(action, `/cases/${caseId}`)
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
