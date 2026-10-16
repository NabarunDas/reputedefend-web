import Link from "next/link"
import type { CaseDestination } from "@/lib/case-flow/destinations"
import type { CaseBlocker, CaseNextAction } from "@/lib/case-flow/model"
import { actionStatePresentation, actionTarget, caseStatusLabel, ownerSentence, serviceTrackLabels } from "../../presentation"
import { Badge, Notice } from "../../../ui"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import {
  journeyStatePresentation,
  type CaseJourneyPresentation,
  type JourneyStepState,
  type JourneyStepView,
} from "@/lib/case-journey/present"
import { IntakeBrief, IntakeReviewForm, VerificationForm } from "./forms"

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
      Development preview on the develop branch. This page does not replace the case cockpit. A step is complete only when its own record says so. The forms do not send email or take a payment.
    </Notice>
    <header className="page-header cockpit-header">
      <div>
        <p className="eyebrow">Guided workflow preview</p>
        <h1>{reference}</h1>
        <p className="cockpit-parties">{customer} — {business}</p>
        <p className="badge-row">
          <Badge tone={status.tone}>{status.word}</Badge>
          <Badge tone="neutral">Service: {serviceTrackLabels[journey.serviceTrack]}</Badge>
          {journey.reopened && <Badge tone="warning">Reopened</Badge>}
        </p>
        <p className="muted">Technical stage: {journey.technicalStageLabel}. The stage shows where the case file sits. It does not complete a step.</p>
      </div>
    </header>
    <section className="panel" aria-labelledby="journey-attention-heading">
      <h2 id="journey-attention-heading">Outstanding attention</h2>
      {journey.attention.length === 0
        ? <p>No outstanding attention is recorded on the case-flow projection.</p>
        : <ul className="notice-list">{journey.attention.map(item => <li key={item.code}>
          <h3>{item.title}</h3>
          <p>{item.explanation}</p>
        </li>)}</ul>}
      {journey.projectionNote && <p className="muted">{journey.projectionNote}</p>}
    </section>

    <div className="guided-workflow-layout">
      <nav aria-label="Eleven-step case workflow">
        <ol className="guided-steps">
          {journey.steps.map(step => {
            const presentation = journeyStatePresentation[step.state]
            const current = step.focus ? "step" : undefined
            return <li
              key={step.id}
              className={`guided-step ${stateClass[step.state]}${step.focus ? " is-focus" : ""}${step.id === selected.id ? " is-selected" : ""}`}
              data-state={step.state}
              data-step={step.id}
            >
              <Link href={`/cases/${caseId}/journey?step=${step.id}`} aria-current={current}>
                <span className="guided-step-mark" aria-hidden="true">{presentation.symbol}</span>
                <span className="guided-step-order">{step.order}</span>
                <span className="guided-step-title">{step.title}</span>
                <span className="guided-step-state">{presentation.label}</span>
              </Link>
            </li>
          })}
        </ol>
      </nav>
      <StepWorkspace step={selected} brief={brief} caseId={caseId} version={version} />
    </div>
    <NextAction journey={journey} caseId={caseId} />
  </section>
}

function StepWorkspace({ step, brief, caseId, version }: { step: JourneyStepView; brief: JourneyIntakeBrief; caseId: string; version: number }) {
  const party = partyLabels[step.responsibleParty]
  return <article className="panel guided-workspace" aria-labelledby="journey-step-heading">
    <p className="eyebrow">Step {step.order} of 11</p>
    <h2 id="journey-step-heading">{step.title}</h2>
    <p className="badge-row"><Badge tone={toneFor(step.state)}>{journeyStatePresentation[step.state].label}</Badge></p>
    <p>{step.purpose}</p>
    {step.unavailableReason && <p className="notice">{step.unavailableReason}</p>}
    <h3>What is already known</h3>
    <ul>{step.known.map(item => <li key={item}>{item}</li>)}</ul>
    <h3>What remains required</h3>
    {step.missing.length === 0 ? <p>Nothing further is required for this step.</p> : <ul>{step.missing.map(item => <li key={item}>{item}</li>)}</ul>}
    <h3>Who must act</h3>
    <p>{step.whoMustAct}</p>
    <p className="muted">The catalogue names {party} as the responsible party for this step.</p>
    {step.decision && <IntakeBrief brief={brief} />}
    {step.decision === "intake" && <IntakeReviewForm caseId={caseId} version={version} />}
    {step.decision === "verification" && <VerificationForm caseId={caseId} version={version} />}
    <h3>Existing destination</h3>
    <Destination destination={step.destination} />
    <h3>What unlocks the next step</h3>
    <p>{step.unlock}</p>
    <h3>{step.decision ? "What this form does not do" : "Not available in this preview"}</h3>
    <p>{step.unsupported}</p>
    {step.decision
      ? <p className="muted">This form records the staff decision for {step.laterWork}. It does not send email, take a payment, or change the technical stage.</p>
      : <p className="muted">The operation itself belongs to {step.laterWork}. This page does not perform it and has no button that pretends to.</p>}
  </article>
}

function Destination({ destination }: { destination: CaseDestination | null }) {
  if (!destination) return <p>No existing workspace owns this step yet.</p>
  return <p><Link href={destination.href}>Open {destination.label}</Link></p>
}

function NextAction({ journey, caseId }: { journey: CaseJourneyPresentation; caseId: string }) {
  return <section className="panel cockpit-next" aria-labelledby="journey-next-heading">
    <p className="eyebrow">Next action</p>
    <h2 id="journey-next-heading">What the case-flow model already recommends</h2>
    {journey.suppressedAction
      ? <div>
        <p>The case-flow model currently names “{journey.suppressedAction.label}”.</p>
        <p>{journey.suppressedAction.reason}</p>
      </div>
      : journey.nextAction
        ? <Recommended action={journey.nextAction} caseId={caseId} />
        : <p>{journey.closed ? "The case is closed, so the case-flow model has no next action." : "The case-flow model has no next action for this projection."}</p>}
    {journey.incompatibilities.filter(item => item !== journey.suppressedAction?.reason).map(item => <p key={item}>{item}</p>)}
    <h3>Blockers already recorded</h3>
    {journey.blockers.length === 0
      ? <p>No blocker is recorded.</p>
      : <ul className="notice-list">{journey.blockers.map(item => <Blocker key={item.code} blocker={item} />)}</ul>}
    <p className="muted">Steps that still have no operation of their own say so in the step panel. They do not gain a button that marks them done.</p>
  </section>
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
