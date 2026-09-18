import Link from "next/link"
import { notFound } from "next/navigation"
import { getCase } from "@/lib/cases/queries"
import { getEvidenceCase } from "@/lib/evidence/queries"
import { ukDate } from "@/lib/admin/activity"
import {
  evidenceActions, fileTypeLabel, formatBytes, type EvidenceVersionRow,
} from "@/lib/evidence/model"
import { Badge, PageHeader } from "../../../ui"
import {
  AccessButtons, CreateRequestForm, RequestStatusForm, ReviewForms, ScanRefreshForm, UploadEvidenceForm, VisibilityForm,
} from "./forms"

export const metadata = { title: "Evidence & Documents" }

function scanTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  if (status === "NO_THREATS_FOUND") return "success"
  if (status === "PENDING") return "warning"
  if (status === "THREATS_FOUND" || status === "FAILED" || status === "UNSUPPORTED" || status === "ACCESS_DENIED") return "danger"
  return "neutral"
}

function VersionCard({ caseId, documentTitle, version }: { caseId: string; documentTitle: string; version: EvidenceVersionRow }) {
  const actions = evidenceActions(version)
  return <article className="evidence-version">
    <h3>Version {version.versionNumber} · {version.originalFilename}</h3>
    <p>{fileTypeLabel(version.contentType)} · {formatBytes(version.sizeBytes)} · uploaded {version.uploadedAt ? ukDate(version.uploadedAt) : "not finished"}</p>
    <p className="badge-row">
      <Badge tone={version.uploadStatus === "UPLOADED" ? "success" : "warning"}>{version.uploadStatus.replaceAll("_", " ")}</Badge>
      <Badge tone={scanTone(version.scanStatus)}>{version.scanStatus.replaceAll("_", " ")}</Badge>
      <Badge tone={version.validationStatus === "VALID" ? "success" : version.validationStatus === "PENDING" ? "warning" : "danger"}>{version.validationStatus}</Badge>
      <Badge tone={version.reviewStatus === "ACCEPTED" ? "success" : version.reviewStatus === "REJECTED" ? "danger" : version.reviewStatus === "UNREVIEWED" ? "warning" : "neutral"}>{version.reviewStatus}</Badge>
      <Badge tone={version.customerVisible ? "info" : "neutral"}>{version.customerVisible ? "Future customer visibility on" : "Not customer visible"}</Badge>
    </p>
    {actions.statusLabel && <p className={actions.threatBlocked ? "notice-danger" : "muted"}>{actions.statusLabel}</p>}
    {version.validationError && <p className="muted">Validation: {version.validationError}</p>}
    {version.reviewNote && <p className="preserve-lines">Review note: {version.reviewNote}</p>}
    {version.reviewedAt && <p className="muted">Reviewed {ukDate(version.reviewedAt)}</p>}
    <div className="evidence-actions">
      {actions.refresh && <ScanRefreshForm caseId={caseId} versionId={version.id} />}
      <AccessButtons caseId={caseId} versionId={version.id} actions={actions} />
    </div>
    {actions.accept || actions.reject ? <ReviewForms caseId={caseId} version={version} actions={actions} /> : null}
    {actions.visibility && <VisibilityForm caseId={caseId} version={version} />}
    {actions.viewHint && !actions.view && <p className="muted" id={`view-hint-${version.id}`}>{actions.viewHint}</p>}
    <p className="sr-only">Document {documentTitle}, version {version.versionNumber}</p>
  </article>
}

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [c, evidence] = await Promise.all([getCase(id), getEvidenceCase(id)])
  if (!c || !evidence) notFound()
  const openRequests = evidence.requests.filter(request => request.status === "OPEN")
  return <section className="page">
    <Link className="back-link" href={`/cases/${c.id}`}>Back to case {c.reference}</Link>
    <PageHeader title="Evidence & Documents" description={<>{c.reference} · {c.client} — {c.business}. Files are stored privately. A clean scan is required before view, download or review.</>} />

    <section className="panel">
      <h2>Evidence requests</h2>
      <p>Creating an evidence request records the requirement only. It does not send an email.</p>
      {!evidence.requests.length && <p className="muted">No evidence requests recorded.</p>}
      <ul className="task-list">{evidence.requests.map(request => <li key={request.id}>
        <strong>{request.title}</strong> · <Badge tone={request.status === "OPEN" ? "info" : request.status === "FULFILLED" ? "success" : "neutral"}>{request.status}</Badge>
        <p className="preserve-lines">{request.requestText}</p>
        <p className="muted">Created {ukDate(request.createdAt)}{request.dueAt ? ` · due ${ukDate(request.dueAt)}` : ""}{request.fulfilledAt ? ` · fulfilled ${ukDate(request.fulfilledAt)}` : ""}</p>
        {request.status === "OPEN" && <RequestStatusForm caseId={c.id} request={request} />}
      </li>)}</ul>
      <details><summary>Create request</summary><CreateRequestForm caseId={c.id} /></details>
    </section>

    <section className="panel">
      <h2>Upload evidence</h2>
      <p>Accepted types: PDF, JPG, JPEG, PNG, WebP and DOCX. Maximum file size 10 MB. The browser uploads directly to private storage. After upload, refresh scan status manually — this page does not poll GuardDuty.</p>
      <UploadEvidenceForm caseId={c.id} documents={evidence.documents} openRequests={openRequests} />
    </section>

    <section className="panel">
      <h2>Documents and versions</h2>
      {!evidence.documents.length && <p className="muted">No documents uploaded yet.</p>}
      {evidence.documents.map(document => <section key={document.id} className="evidence-document">
        <h3>{document.title}</h3>
        <p className="muted">{document.versions.length} version{document.versions.length === 1 ? "" : "s"}</p>
        {document.versions.map(version => <VersionCard key={version.id} caseId={c.id} documentTitle={document.title} version={version} />)}
      </section>)}
    </section>
  </section>
}
