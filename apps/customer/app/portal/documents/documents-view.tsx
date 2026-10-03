import { caseTypeLabel, formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { documentContext, evidenceStateLabel, publishedFileDetail } from "@/lib/portal/documents/model"
import type { CustomerDocuments, EvidenceNeed, EvidenceSubmission, PublishedDocument } from "@/lib/portal/documents/parse"

function groupByReference<T extends { reference: string }>(items: T[]) {
  const groups: { reference: string; items: T[] }[] = []
  for (const item of items) {
    const current = groups[groups.length - 1]
    if (current && current.reference === item.reference) current.items.push(item)
    else groups.push({ reference: item.reference, items: [item] })
  }
  return groups
}

function CaseLine({ item }: { item: EvidenceNeed | EvidenceSubmission | PublishedDocument }) {
  const service = serviceLabel(item.serviceTrack)
  return (
    <p className="document-case">
      <span className="case-ref">{item.reference}</span>
      {" · "}
      {caseTypeLabel(item.caseType)}
      {" · "}
      {item.businessName}
      {item.locationName ? ` · ${item.locationName}` : ""}
      {service ? ` · ${service}` : ""}
    </p>
  )
}

export function DocumentsUnavailable() {
  return (
    <div className="documents-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load your documents</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal">Back to your dashboard</a></p>
    </div>
  )
}

export function DocumentsView({ documents }: { documents: CustomerDocuments }) {
  const needs = groupByReference(documents.needs)
  const submissions = groupByReference(documents.submissions)
  const published = groupByReference(documents.documents)
  return (
    <div className="documents-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Documents</h1>
      <p>See what we still need from you, what you have sent, and what ProfileRelaunch has published for you.</p>

      <section aria-labelledby="needs-heading">
        <h2 id="needs-heading">Evidence we need from you</h2>
        {needs.length === 0 ? <p>Nothing is waiting for you to upload.</p> : (
          <ul className="document-list">
            {needs.map(group => (
              <li key={group.reference}>
                {group.items.map(item => (
                  <article className="case-card" key={`${item.reference}-${item.selector}`}>
                    <CaseLine item={item} />
                    <h3>{item.title}</h3>
                    <p>{item.requestText}</p>
                    {item.dueAt ? <p>Requested by {formatPortalDate(item.dueAt)}</p> : null}
                    <p>{evidenceStateLabel(item.state)}{item.filename ? ` · ${item.filename}` : ""}</p>
                    <p><a href={`/portal/cases/${item.reference}/documents`}>Upload evidence for {item.reference}</a></p>
                  </article>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="submitted-heading">
        <h2 id="submitted-heading">Your submitted evidence</h2>
        {submissions.length === 0 ? <p>You haven&apos;t submitted any evidence yet.</p> : (
          <ul className="document-list">
            {submissions.map(group => (
              <li key={group.reference}>
                {group.items.map(item => (
                  <article className="case-card" key={`${item.reference}-${item.title}-${item.submittedAt}`}>
                    <CaseLine item={item} />
                    <h3>{item.title}</h3>
                    <p>{item.filename}</p>
                    <p>Submitted {formatPortalDate(item.submittedAt)}</p>
                    <p>{evidenceStateLabel(item.state)}</p>
                  </article>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="published-heading">
        <h2 id="published-heading">Documents from ProfileRelaunch</h2>
        {published.length === 0 ? <p>ProfileRelaunch hasn&apos;t published any documents for you yet.</p> : (
          <ul className="document-list">
            {published.map(group => (
              <li key={group.reference}>
                {group.items.map(item => (
                  <article className="case-card" key={`${item.reference}-${item.selector}`}>
                    <CaseLine item={item} />
                    <p className="document-context">{documentContext(item)}</p>
                    <h3>{item.title}</h3>
                    <p>{item.filename}</p>
                    <p>{publishedFileDetail(item)}</p>
                    <p>
                      <a href={`/api/portal/documents/download?reference=${encodeURIComponent(item.reference)}&selector=${encodeURIComponent(item.selector)}`}>
                        Download {item.filename}
                      </a>
                    </p>
                  </article>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
