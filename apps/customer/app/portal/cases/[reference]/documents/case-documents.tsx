import { caseTypeLabel, formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { evidenceStateLabel, publishedFileDetail } from "@/lib/portal/documents/model"
import type { CustomerCaseDocuments } from "@/lib/portal/documents/parse"
import { EvidenceUploadForm } from "../../../documents/upload-form"

export function CaseDocumentsUnavailable() {
  return (
    <div className="documents-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load documents for this case</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

export function CaseDocuments({ documents }: { documents: CustomerCaseDocuments }) {
  const item = documents.case
  const service = serviceLabel(item.serviceTrack)
  return (
    <div className="documents-page">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li><a href={`/portal/cases/${item.reference}`}>{item.reference}</a></li>
          <li aria-current="page">Documents and evidence</li>
        </ol>
      </nav>
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <p className="case-ref">{item.reference}</p>
      <h1>Documents and evidence</h1>
      <p className="case-business">{item.businessName}</p>
      {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
      <p>{caseTypeLabel(item.caseType)}{service ? ` · ${service}` : ""}</p>

      <section aria-labelledby="requests-heading">
        <h2 id="requests-heading">Evidence requests</h2>
        {documents.requests.length === 0 ? <p>There are no evidence requests for this case.</p> : (
          <ul className="document-list">
            {documents.requests.map(request => (
              <li key={request.selector}>
                <article className="case-card">
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
        )}
      </section>

      <section aria-labelledby="case-submitted-heading">
        <h2 id="case-submitted-heading">Your submitted evidence</h2>
        {documents.submissions.length === 0 ? <p>You haven&apos;t submitted any evidence for this case yet.</p> : (
          <ul className="document-list">
            {documents.submissions.map(submission => (
              <li key={`${submission.title}-${submission.submittedAt}`}>
                <article className="case-card">
                  <h3>{submission.title}</h3>
                  <p>{submission.filename}</p>
                  <p>Submitted {formatPortalDate(submission.submittedAt)}</p>
                  <p>{evidenceStateLabel(submission.state)}</p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="case-published-heading">
        <h2 id="case-published-heading">Documents from ProfileRelaunch</h2>
        {documents.documents.length === 0 ? <p>ProfileRelaunch hasn&apos;t published any documents for this case yet.</p> : (
          <ul className="document-list">
            {documents.documents.map(file => (
              <li key={file.selector}>
                <article className="case-card">
                  <h3>{file.title}</h3>
                  <p>{file.filename}</p>
                  <p>{publishedFileDetail(file)}</p>
                  <p>
                    <a href={`/api/portal/documents/download?reference=${encodeURIComponent(item.reference)}&selector=${encodeURIComponent(file.selector)}`}>
                      Download {file.filename}
                    </a>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="case-back"><a href={`/portal/cases/${item.reference}`}>Back to this case</a></p>
    </div>
  )
}
