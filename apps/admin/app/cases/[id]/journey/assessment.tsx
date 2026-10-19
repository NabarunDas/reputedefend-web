"use client"
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  assessmentPathwayLabel,
  type AssessmentVersionView,
  type CaseAssessmentView,
} from "@/lib/case-journey/assessment"
import type { JourneyStepState } from "@/lib/case-journey/present"

function postAssessment(key: string, body: unknown) {
  return fetch("/api/cases/journey/assessment", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  })
}

function useAssessmentPost() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState("")
  const key = useRef<string | null>(null)
  async function send(body: unknown) {
    if (busy || done || uncertain) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await postAssessment(key.current, body)
      const result = await response.json() as { message?: string }
      setMessage(result.message || "Unable to confirm the change.")
      if (response.ok) {
        setDone(true)
        router.refresh()
      } else if (response.status >= 500 || response.status === 409) setUncertain(true)
      else key.current = null
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      setUncertain(true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, done, uncertain, message, send }
}

function stamp(value: string | null): string {
  if (!value) return "Not recorded"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(parsed)
}

function VersionText({ version }: { version: AssessmentVersionView }) {
  return <dl>
    <dt>Case issue and findings</dt><dd className="preserve-lines">{version.findings}</dd>
    <dt>Evidence considered</dt><dd className="preserve-lines">{version.evidenceConsidered}</dd>
    <dt>Google Business Profile issue</dt><dd className="preserve-lines">{version.profileIssue || "Not known"}</dd>
    <dt>Policy concerns</dt><dd className="preserve-lines">{version.policyConcerns || "None recorded"}</dd>
    <dt>Recommended action</dt><dd className="preserve-lines">{version.recommendedAction}</dd>
    <dt>Recommended pathway</dt><dd>{assessmentPathwayLabel(version.servicePathway)}</dd>
    <dt>Rationale</dt><dd className="preserve-lines">{version.rationale}</dd>
    <dt>Risks</dt><dd className="preserve-lines">{version.risks}</dd>
    <dt>Outstanding information</dt><dd className="preserve-lines">{version.outstandingInformation || "None recorded"}</dd>
    <dt>Draft saved</dt><dd>{stamp(version.draftedAt)}</dd>
    <dt>Reviewed</dt><dd>{stamp(version.reviewedAt)}</dd>
    <dt>Approved</dt><dd>{stamp(version.approvedAt)}</dd>
  </dl>
}

function draftBody(versionNumber: number, source: AssessmentVersionView, form?: FormData) {
  const read = (name: string, fallback: string) => form ? String(form.get(name) ?? "") : fallback
  return {
    recordVersion: versionNumber,
    findings: read("findings", source.findings),
    evidenceConsidered: read("evidenceConsidered", source.evidenceConsidered),
    profileIssue: read("profileIssue", source.profileIssue),
    policyConcerns: read("policyConcerns", source.policyConcerns),
    recommendedAction: read("recommendedAction", source.recommendedAction),
    servicePathway: read("servicePathway", source.servicePathway),
    rationale: read("rationale", source.rationale),
    risks: read("risks", source.risks),
    outstandingInformation: read("outstandingInformation", source.outstandingInformation),
  }
}

/**
 * Draft, review and approval for Step 5.
 * Posting the form does not mark the step complete. The page reads that from the stored approval.
 */
export function AssessmentPanel({
  caseId,
  version,
  assessment,
  stepState,
}: {
  caseId: string
  version: number
  assessment: CaseAssessmentView | null
  stepState: JourneyStepState
}) {
  const versions = assessment?.versions ?? []
  const open = versions.find(item => item.status === "DRAFT" || item.status === "REVIEWED") ?? null
  const latestApproved = versions
    .filter(item => item.status === "APPROVED")
    .sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null
  const [composing, setComposing] = useState(false)
  const current = latestApproved?.current === true && latestApproved.stale === false
  const reviewed = Boolean(open && open.status === "REVIEWED" && !composing)
  const showStored = reviewed || (current && !open && !composing)
  const composerSource = open && open.status === "DRAFT" && !composing ? open : latestApproved
  const composerVersion = open && open.status === "DRAFT" && !composing ? open.recordVersion : 0
  const displayed = showStored ? (reviewed ? open : latestApproved) : (open && open.status === "DRAFT" && !composing ? open : null)
  const history = versions.filter(item => item.id !== displayed?.id)

  return <div className="guided-facts" data-assessment={open?.status ?? (current ? "APPROVED" : "NONE")}>
    {assessment === null && <p className="notice">No assessment is on file from the reviewed read. A save stays a draft until an approval is stored. If the reviewed database change is not applied yet, the save cannot be stored.</p>}
    {current && <div className="notice" role="status">
      <p>This recommends {assessmentPathwayLabel(latestApproved.servicePathway)}. It is not an accepted agreement and the service is not activated.</p>
      {open && <p>A newer draft is open. The current approval still completes this step until the case, the profile, or the evidence changes, or the case is reopened.</p>}
    </div>}
    {latestApproved && !current && <div className="guided-warning" role="status">
      <p>{latestApproved.staleReason === "reopened"
        ? "The case was reopened after this assessment was approved. That approval is not current."
        : "This approval no longer matches the case, the profile, or the evidence."}</p>
      <p>Saving a new draft does not repair the old approval. The step is complete only after a new review and approval.</p>
    </div>}
    {stepState === "NEEDS_ATTENTION" && current && <div className="guided-warning" role="status">
      <p>The approved assessment and the evidence on this case disagree. This page does not change either record.</p>
    </div>}
    <p>A suspended or missing Google listing does not block this assessment. Approving a pathway does not accept a quote and does not activate the service.</p>
    {showStored && displayed && <VersionText version={displayed} />}
    {reviewed && open && <ReviewActions caseId={caseId} version={version} source={open} />}
    {current && !open && !composing && <button type="button" onClick={() => setComposing(true)}>Start a new draft</button>}
    {current && composing && <p>Saving a new draft does not undo the current approval.</p>}
    {!showStored && <AssessmentForm
      caseId={caseId}
      version={version}
      recordVersion={composerVersion}
      source={composerSource}
      canReview={Boolean(open && open.status === "DRAFT" && !composing)}
    />}
    {history.length > 0 && <details className="guided-details">
      <summary>Earlier assessment versions</summary>
      {history.map(item => <section key={item.id}>
        <h3>Version {item.versionNumber} — {item.status === "APPROVED" ? "Approved" : item.status === "REVIEWED" ? "Reviewed" : "Draft"}</h3>
        <VersionText version={item} />
      </section>)}
    </details>}
  </div>
}

function ReviewActions({
  caseId,
  version,
  source,
}: {
  caseId: string
  version: number
  source: AssessmentVersionView
}) {
  const { busy, done, uncertain, message, send } = useAssessmentPost()
  async function approve() {
    await send({ caseId, version, operation: "approve", data: { recordVersion: source.recordVersion } })
  }
  async function revise() {
    await send({ caseId, version, operation: "save_draft", data: draftBody(source.recordVersion, source) })
  }
  return <div className="record-form">
    <p>The reviewed text is stored. Approving it does not by itself finish the step if the evidence has changed or the case was reopened.</p>
    <p>Approval is stored only when the evidence requests are fulfilled and a live file is accepted. The same staff session may review and approve. The audit event records who did each one.</p>
    <button type="button" onClick={approve} disabled={busy || done || uncertain}>Approve assessment</button>
    <button type="button" onClick={revise} disabled={busy || done || uncertain}>Return to draft</button>
    {message && <p role="status">{message}</p>}
  </div>
}

function AssessmentForm({
  caseId,
  version,
  recordVersion,
  source,
  canReview,
}: {
  caseId: string
  version: number
  recordVersion: number
  source: AssessmentVersionView | null
  canReview: boolean
}) {
  const { busy, done, uncertain, message, send } = useAssessmentPost()
  const [dirty, setDirty] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const action = submitter instanceof HTMLButtonElement ? submitter.value : "save_draft"
    if (action === "submit_review") {
      await send({ caseId, version, operation: "submit_review", data: { recordVersion } })
      return
    }
    const blank: AssessmentVersionView = source ?? {
      id: "",
      versionNumber: 0,
      status: "DRAFT",
      recordVersion: 0,
      findings: "",
      evidenceConsidered: "",
      profileIssue: "",
      policyConcerns: "",
      recommendedAction: "",
      servicePathway: "UNDECIDED",
      rationale: "",
      risks: "",
      outstandingInformation: "",
      draftedAt: "",
      reviewedAt: null,
      approvedAt: null,
      current: false,
      stale: false,
      staleReason: null,
    }
    await send({
      caseId,
      version,
      operation: "save_draft",
      data: draftBody(recordVersion, blank, new FormData(event.currentTarget)),
    })
  }
  return <form className="record-form" onSubmit={submit} onChange={() => setDirty(true)}>
    <h3>Assessment draft</h3>
    <p>Saving this form does not complete the step. Only a current approved assessment does.</p>
    <fieldset disabled={busy || done || uncertain}>
      <label>Case issue and findings
        <textarea name="findings" required minLength={20} maxLength={4000} rows={4} defaultValue={source?.findings ?? ""} />
      </label>
      <label>Evidence considered
        <textarea name="evidenceConsidered" required minLength={10} maxLength={4000} rows={3} defaultValue={source?.evidenceConsidered ?? ""} />
      </label>
      <label>Google Business Profile issue, where known
        <textarea name="profileIssue" maxLength={2000} rows={2} defaultValue={source?.profileIssue ?? ""} />
      </label>
      <label>Relevant policy concerns, where known
        <textarea name="policyConcerns" maxLength={2000} rows={2} defaultValue={source?.policyConcerns ?? ""} />
      </label>
      <label>Recommended action
        <textarea name="recommendedAction" required minLength={10} maxLength={2000} rows={3} defaultValue={source?.recommendedAction ?? ""} />
      </label>
      <label>Recommended pathway
        <select name="servicePathway" required defaultValue={source?.servicePathway ?? "UNDECIDED"}>
          <option value="UNDECIDED">Not yet decided</option>
          <option value="GUIDED">Guided — a recommendation, not an accepted agreement</option>
          <option value="MANAGED">Managed — a recommendation, not an activated service</option>
        </select>
      </label>
      <label>Rationale
        <textarea name="rationale" required minLength={20} maxLength={4000} rows={3} defaultValue={source?.rationale ?? ""} />
      </label>
      <label>Risks
        <textarea name="risks" required minLength={10} maxLength={2000} rows={2} defaultValue={source?.risks ?? ""} />
      </label>
      <label>Outstanding information
        <textarea name="outstandingInformation" maxLength={2000} rows={2} defaultValue={source?.outstandingInformation ?? ""} />
      </label>
      <button type="submit" name="action" value="save_draft">{busy ? "Saving…" : "Save draft"}</button>
      {canReview && <button type="submit" name="action" value="submit_review" disabled={dirty}>Submit for review</button>}
    </fieldset>
    {canReview && dirty && <p>Save the draft before submitting it for review. Unsaved edits are not part of the review.</p>}
    {message && <p role="status">{message}</p>}
  </form>
}
