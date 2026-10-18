import Link from "next/link"
import { caseDestination } from "@/lib/case-flow/destinations"
import { ukDate } from "@/lib/admin/activity"
import { fileTypeLabel, formatBytes } from "@/lib/evidence/model"
import type { EvidenceCase } from "@/lib/evidence/model"
import type { EvidenceDocumentWorkspace, EvidenceRequestWorkspace, EvidenceVersionWorkspace, EvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import { evidenceVersionPipeline } from "@/lib/evidence/workspace"
import type { PreparedPackCase } from "@/lib/packs/model"
import type { CaseDetail } from "@/lib/cases/model"
import {
  AccessButtons, CreateRequestForm, PreparedPackPanel, RequestStatusForm, ReviewForms, ScanRefreshForm, UploadEvidenceForm, VisibilityForm,
} from "./forms"

function versionContext(documentTitle: string, versionNumber: number): string {
  return `${documentTitle}, version ${versionNumber}`
}

function VersionBody({
  caseId, documentTitle, presented, showVisibility = true,
}: {
  caseId: string
  documentTitle: string
  presented: EvidenceVersionWorkspace
  showVisibility?: boolean
}) {
  const { version, actions, label, state } = presented
  const context = versionContext(documentTitle, version.versionNumber)
  const pipeline = evidenceVersionPipeline(version)
  const threat = state === "THREAT_BLOCKED"
  return <article id={presented.anchorId} className={threat ? "evidence-version is-threat" : "evidence-version"}>
    <p className="evidence-filename"><strong>Version {version.versionNumber}</strong> · {version.originalFilename}</p>
    <p className="muted">{fileTypeLabel(version.contentType)} · {formatBytes(version.sizeBytes)} · uploaded {version.uploadedAt ? ukDate(version.uploadedAt) : "not finished"}</p>
    <p className={threat ? "notice-danger" : "evidence-status"}>{label}{label.endsWith(".") ? "" : "."}</p>
    {version.submissionSource === "CUSTOMER" && <p>Customer submitted. This file still goes through the security scan, file validation and Admin review.</p>}
    {version.submissionSource === "ADMIN" && <p>Admin uploaded.</p>}
    {state === "CONTENT_INVALID" && <p className="preserve-lines">File validation failed. This is not a malware result.{version.validationError ? ` ${version.validationError}` : ""}</p>}
    {state !== "CONTENT_INVALID" && version.validationError && <p className="preserve-lines evidence-note">Validation note: {version.validationError}</p>}
    {state === "REJECTED" && <p>This version stays rejected. A replacement is required before it can satisfy the request.</p>}
    {version.reviewNote && <p className="preserve-lines evidence-note">Review note: {version.reviewNote}</p>}
    {version.reviewedAt && <p className="muted">Reviewed {ukDate(version.reviewedAt)}</p>}
    <p>{version.customerVisible ? "Marked for future customer visibility." : "Not marked for future customer visibility."} No current customer portal exposes this file.</p>
    <div className="evidence-actions">
      {actions.refresh && <ScanRefreshForm caseId={caseId} versionId={version.id} context={context} />}
      {!actions.threatBlocked && <AccessButtons caseId={caseId} versionId={version.id} actions={actions} context={context} />}
    </div>
    {(actions.accept || actions.reject) && <ReviewForms caseId={caseId} version={version} actions={actions} context={context} />}
    {showVisibility && actions.visibility && <VisibilityForm caseId={caseId} version={version} />}
    {actions.viewHint && !actions.view && <p className="muted" id={`view-hint-${version.id}`}>{actions.viewHint}</p>}
    <details>
      <summary>Processing stages</summary>
      <ol className="evidence-pipeline">
        {pipeline.map(step => <li key={step.stage}>
          <span>{step.stage}</span>
          <span>
            <span className="sr-only">{step.tone === "done" ? "Done." : step.tone === "problem" ? "Problem." : "Outstanding."}</span>
            {step.detail}
          </span>
        </li>)}
      </ol>
      <p className="muted evidence-note">Technical status: upload {version.uploadStatus}, security scan {version.scanStatus}, file validation {version.validationStatus}, review {version.reviewStatus}.</p>
    </details>
  </article>
}

function EvidenceDocumentCard({
  caseId, presented, heading, showVisibility = true,
}: { caseId: string; presented: EvidenceDocumentWorkspace; heading: "h3" | "h4"; showVisibility?: boolean }) {
  const Title = heading
  const latest = presented.latest
  return <section className="evidence-document">
    <Title>{presented.document.title}</Title>
    {presented.requestTitle
      ? <p className="muted">Evidence request: {presented.requestTitle}</p>
      : <p className="muted">Not linked to an evidence request.</p>}
    <VersionBody caseId={caseId} documentTitle={presented.document.title} presented={latest} showVisibility={showVisibility} />
    {presented.history.length > 0 && <details>
      <summary>Version history ({presented.history.length})</summary>
      {presented.history.map(version => <VersionBody key={version.version.id} caseId={caseId} documentTitle={presented.document.title} presented={version} showVisibility={showVisibility} />)}
    </details>}
  </section>
}

function EvidenceRequestCard({ caseId, request, showVisibility = true }: { caseId: string; request: EvidenceRequestWorkspace; showVisibility?: boolean }) {
  const open = request.view ? request.view.state.startsWith("OPEN_") : request.request.status === "OPEN"
  const satisfied = request.view?.state === "OPEN_SATISFIED"
  return <article id={request.anchorId} className={satisfied ? "evidence-request is-satisfied" : open ? "evidence-request" : "evidence-request is-quiet"}>
    <h3>{request.request.title}</h3>
    <p className="evidence-status">{request.label}.</p>
    <p className={satisfied ? "notice-strong" : undefined}>{request.headline}</p>
    <p className="preserve-lines">{request.request.requestText}</p>
    <p className="muted">Recorded {ukDate(request.request.createdAt)}{request.request.dueAt ? ` · due ${ukDate(request.request.dueAt)}` : ""}{request.request.fulfilledAt ? ` · fulfilled ${ukDate(request.request.fulfilledAt)}` : ""}</p>
    {request.overdue && request.request.dueAt && <p className="notice-danger">Overdue · due {ukDate(request.request.dueAt)}</p>}
    {request.request.status === "OPEN" && satisfied && <RequestStatusForm caseId={caseId} request={request.request} prominentFulfil />}
    {request.documents.map(document => <EvidenceDocumentCard key={document.document.id} caseId={caseId} presented={document} heading="h4" showVisibility={showVisibility} />)}
    {open && <p><a href="#add-evidence">Add evidence for this request</a></p>}
    {request.request.status === "OPEN" && !satisfied && <RequestStatusForm caseId={caseId} request={request.request} />}
  </article>
}

function CustomerContact({ caseId, model, review = false }: { caseId: string; model: EvidenceWorkspaceModel; review?: boolean }) {
  if (!model.showContact) return null
  const failed = model.contactState === "FAILED"
  const recordedOnly = model.contactState === "NOT_PREPARED"
  return <section className="panel" aria-labelledby="evidence-contact">
    <h2 id="evidence-contact">Customer contact</h2>
    {recordedOnly
      ? <p>The requirement is recorded, but no evidence-request email has been prepared for this case.</p>
      : <p className={failed ? "notice-danger" : undefined}>Latest evidence-request email for this case: {model.contactLabel}.</p>}
    <p>Email delivery is currently tracked at case level, not per evidence request.</p>
    {review && model.summary.anyUpload && model.contactState !== "DELIVERED" && <p>A submitted file can be reviewed before delivery is confirmed. Reviewing it does not record the email as delivered.</p>}
    {caseDestination("CASE_COMMUNICATIONS", caseId) && <p><Link href={caseDestination("CASE_COMMUNICATIONS", caseId)!.href}>View case communications</Link></p>}
  </section>
}

function CaseAction({ model }: { model: EvidenceWorkspaceModel }) {
  if (model.caseAction.kind === "evidence") {
    return <section className="panel" aria-labelledby="case-next-action">
      <h2 id="case-next-action">Case next action</h2>
      <p className="evidence-status">{model.caseAction.label}</p>
      <p>{model.caseAction.description}</p>
    </section>
  }
  if (model.caseAction.kind === "elsewhere") {
    return <p className="muted">The case&apos;s next action is outside Evidence.{model.caseAction.href && model.caseAction.destinationLabel
      ? <> <Link href={model.caseAction.href}>{model.caseAction.destinationLabel}</Link></>
      : null}</p>
  }
  return null
}

export function EvidenceWorkspace({
  caseDetail, evidence, packs, model, scope = "workspace",
}: {
  caseDetail: CaseDetail
  evidence: EvidenceCase
  packs: PreparedPackCase
  model: EvidenceWorkspaceModel
  /** Guided review reuses these commands and leaves pack preparation on its own step. */
  scope?: "workspace" | "review"
}) {
  const openRequests = evidence.requests.filter(request => request.status === "OPEN")
  const review = scope === "review"
  return <>
    {model.parityMismatches.length > 0 && <section className="panel">
      <h2>Evidence records disagree</h2>
      <p className="notice-danger">The evidence records and the case-flow reading of this case disagree. Files stay with the request stored on the document. Nothing was attached by filename, date or subject.</p>
      <ul>{model.parityMismatches.map(mismatch => <li key={mismatch}>{mismatch}</li>)}</ul>
    </section>}

    {model.summaryLines.length > 0 && <section className="panel" aria-labelledby="evidence-summary">
      <h2 id="evidence-summary">Evidence summary</h2>
      <ul className="evidence-summary">{model.summaryLines.map(line => <li key={line}>{line}</li>)}</ul>
    </section>}
    <CaseAction model={model} />
    <CustomerContact caseId={caseDetail.id} model={model} review={review} />

    {model.empty ? (review ? <section className="panel">
      <h2>No evidence on file</h2>
      <p>No evidence has been requested or uploaded for this case.</p>
      <p>Completing this step without a file needs a separately recorded decision that no documents are required. This step does not record that decision and does not mark itself complete.</p>
    </section> : <section className="panel">
      <h2>Start evidence</h2>
      <p>No evidence has been requested or uploaded for this case.</p>
      <h3>Create request</h3>
      <CreateRequestForm caseId={caseDetail.id} />
      <h3>Add evidence</h3>
      <p>Accepted types: PDF, JPG, JPEG, PNG, WebP and DOCX. Maximum file size 10 MB. The browser uploads directly to private storage. After upload, refresh scan status manually — this page does not poll GuardDuty. Uploading a file does not accept it, and a clean scan is not approval.</p>
      <UploadEvidenceForm caseId={caseDetail.id} documents={evidence.documents} openRequests={openRequests} />
    </section>) : <>
      {model.openRequests.length > 0 && <section className="panel" aria-labelledby="open-evidence-requests">
        <h2 id="open-evidence-requests">Open evidence requests</h2>
        {model.openRequests.map(request => <EvidenceRequestCard key={request.request.id} caseId={caseDetail.id} request={request} showVisibility={!review} />)}
      </section>}

      {model.unlinkedDocuments.length > 0 && <section className="panel" aria-labelledby="other-evidence">
        <h2 id="other-evidence">Evidence not linked to a request</h2>
        {model.unlinkedDocuments.map(document => <EvidenceDocumentCard key={document.document.id} caseId={caseDetail.id} presented={document} heading="h3" showVisibility={!review} />)}
      </section>}

      <section className="panel" id="add-evidence">
        <h2>Add evidence</h2>
        <p>Upload a file against an open request, add a new document, or add a new version of an existing document. Accepted types: PDF, JPG, JPEG, PNG, WebP and DOCX. Maximum file size 10 MB. The browser uploads directly to private storage. After upload, refresh scan status manually — this page does not poll GuardDuty. Uploading a file does not accept it, and a clean scan is not approval.</p>
        <UploadEvidenceForm caseId={caseDetail.id} documents={evidence.documents} openRequests={openRequests} />
      </section>

      {!review && <section className="panel">
        <h2>Create request</h2>
        <p>Creating this request records what is needed. It does not contact the customer.</p>
        <details>
          <summary>Create request</summary>
          <CreateRequestForm caseId={caseDetail.id} />
        </details>
      </section>}

      {model.completedRequests.length > 0 && <section className="panel evidence-completed" aria-labelledby="completed-evidence-requests">
        <h2 id="completed-evidence-requests">Completed requests</h2>
        {model.completedRequests.map(request => <EvidenceRequestCard key={request.request.id} caseId={caseDetail.id} request={request} showVisibility={!review} />)}
      </section>}

      {!review && <PreparedPackPanel caseId={caseDetail.id} packs={packs} />}
    </>}
  </>
}
