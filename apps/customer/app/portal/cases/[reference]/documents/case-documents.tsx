import { caseTypeLabel, formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { evidenceStateLabel } from "@/lib/portal/documents/model"
import type { CustomerCaseDocuments, EvidenceSubmission } from "@/lib/portal/documents/parse"
import { ReadyForYou, SubmittedEvidence, needsAttention } from "../../../documents/document-sections"
import { EvidenceUploadForm } from "../../../documents/upload-form"
import { GuidedHandoverForm } from "./handover-form"

export function CaseDocumentsUnavailable() {
  return (
    <div className="documents-page state-panel">
      <h1>We couldn&apos;t load documents for this case</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

export function CaseDocuments({ documents }: { documents: CustomerCaseDocuments }) {
  const item = documents.case
  const service = serviceLabel(item.serviceTrack)
  const requests = documents.requests.filter(request => needsAttention(request.state, request.canUpload))
  const submissions: EvidenceSubmission[] = documents.submissions.map(submission => ({ ...item, ...submission }))
  const ready = documents.documents.length > 0 || documents.pack ? [{
    ...item,
    guidedPack: documents.pack !== null,
    packEvidence: documents.pack ? "published" as const : "none" as const,
    packTitle: documents.pack?.title ?? null,
    files: documents.documents.map(file => ({
      ...file,
      instructions: documents.pack?.instructionSelectors.includes(file.selector) ?? false,
    })),
    footer: documents.pack ? (
      <GuidedHandoverForm
        reference={item.reference}
        submitted={documents.pack.customerSubmitted}
        correctionRequested={documents.pack.correctionRequested}
        outcomeReported={documents.pack.outcomeReported}
        outcomeReviewed={documents.pack.outcomeReviewed}
        evidenceOptions={documents.requests.filter(request => request.filename).map(request => ({
          selector: request.selector,
          label: request.filename ?? request.title,
        }))}
      />
    ) : null,
  }] : []
  return (
    <div className="documents-page">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li><a href={`/portal/cases/${item.reference}`}>{item.reference}</a></li>
          <li aria-current="page">Documents and evidence</li>
        </ol>
      </nav>
      <header className="case-summary-band documents-case-header">
        <div>
          <h1>Documents and evidence</h1>
          <p className="case-identity-business">{item.businessName}</p>
          {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
          <p className="case-service">{caseTypeLabel(item.caseType)}{service ? ` · ${service}` : ""}</p>
          <p className="case-ref">{item.reference}</p>
        </div>
      </header>

      {requests.length === 0 ? <p className="documents-status documents-empty">Nothing is waiting for you to upload.</p> : (
        <section className="documents-action" aria-labelledby="requests-heading">
          <h2 id="requests-heading">Action needed</h2>
          <ul className="document-list">
            {requests.map(request => (
              <li key={request.selector}>
                <article className="document-row">
                  <h3>{request.title}</h3>
                  <p>{request.requestText}</p>
                  {request.dueAt ? <p>Requested by {formatPortalDate(request.dueAt)}</p> : null}
                  <p>{evidenceStateLabel(request.state)}{request.filename ? ` · ${request.filename}` : ""}</p>
                  {request.submittedAt ? <p>Submitted {formatPortalDate(request.submittedAt)}</p> : null}
                  {request.canUpload ? <EvidenceUploadForm reference={item.reference} selector={request.selector} /> : null}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ReadyForYou cases={ready} />
      <SubmittedEvidence submissions={submissions} expanded={requests.length > 0} />
      <p className="case-back"><a href={`/portal/cases/${item.reference}`}>Back to this case</a></p>
    </div>
  )
}
