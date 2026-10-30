import type { ReactNode } from "react"
import { caseTypeLabel, formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { archiveActionLabel, evidenceStateLabel, GUIDED_PACK_READY, publishedFileMeta } from "@/lib/portal/documents/model"
import { GUIDED_PACK_INSTRUCTIONS } from "@/lib/portal/documents/parse"
import type { EvidenceNeed, EvidenceState, EvidenceSubmission, PortalCaseContext, PublishedDocument } from "@/lib/portal/documents/parse"

export type ReadyFile = {
  selector: string
  title: string
  filename: string
  contentType: string
  sizeBytes: number
  publishedAt: string
  instructions?: boolean
}

type ReadyCase = PortalCaseContext & {
  files: ReadyFile[]
  guidedPack: boolean
  packTitle?: string | null
  footer?: ReactNode
}

export function downloadHref(reference: string, selector: string) {
  return `/api/portal/documents/download?reference=${encodeURIComponent(reference)}&selector=${encodeURIComponent(selector)}`
}

export function archiveHref(reference: string) {
  return `/api/portal/documents/archive?reference=${encodeURIComponent(reference)}`
}

/**
 * The visible label is "Download". The accessible name names the curated
 * document title. Titles are not rewritten from filenames.
 */
export function DownloadControl({ href, title }: { href: string; title: string }) {
  return (
    <a className="portal-button document-download" href={href} aria-label={`Download ${title}`}>
      Download
    </a>
  )
}

function CaseIdentity({ item, count }: { item: PortalCaseContext; count?: number }) {
  const service = serviceLabel(item.serviceTrack)
  return (
    <div className="document-case-identity">
      <p className="case-ref">{item.reference}</p>
      <p className="document-case-business">{item.businessName}</p>
      {item.locationName ? <p className="document-case-location">{item.locationName}</p> : null}
      <p className="document-case-service">
        {caseTypeLabel(item.caseType)}
        {service ? ` · ${service}` : ""}
        {typeof count === "number" ? ` · ${count} ${count === 1 ? "file" : "files"}` : ""}
      </p>
    </div>
  )
}

export function ActionNeeded({ needs }: { needs: EvidenceNeed[] }) {
  if (needs.length === 0) {
    return <p className="documents-status">Nothing is waiting for you to upload.</p>
  }
  const groups = groupByReference(needs)
  return (
    <section className="documents-action" aria-labelledby="needs-heading">
      <h2 id="needs-heading">Action needed</h2>
      <ul className="document-list">
        {groups.map(group => (
          <li key={group.reference} className="document-group">
            <CaseIdentity item={group.items[0]} />
            {group.items.map(item => (
              <article className="document-row" key={`${item.reference}-${item.selector}`}>
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
    </section>
  )
}

export function ReadyForYou({ cases }: { cases: ReadyCase[] }) {
  return (
    <section className="documents-ready" aria-labelledby="published-heading">
      <h2 id="published-heading">Ready for you</h2>
      {cases.length === 0 ? <p>ProfileRelaunch hasn&apos;t published any documents for you yet.</p> : (
        <ul className="document-list">
          {cases.map(item => <ReadyCaseCard key={item.reference} item={item} />)}
        </ul>
      )}
    </section>
  )
}

function ReadyCaseCard({ item }: { item: ReadyCase }) {
  return (
    <li className="document-group">
      <CaseIdentity item={item} count={item.files.length} />
      {item.guidedPack ? (
        <div className="document-pack-note">
          {item.packTitle ? <p className="document-pack-title">{item.packTitle}</p> : null}
          <p className="document-pack-title">{GUIDED_PACK_READY}</p>
          <p>{GUIDED_PACK_INSTRUCTIONS}</p>
        </div>
      ) : null}
      {item.files.length > 0 ? (
        <p>
          <a className="portal-button" href={archiveHref(item.reference)}>
            {archiveActionLabel(item.files.length)}
          </a>
        </p>
      ) : <p>ProfileRelaunch hasn&apos;t published any documents for this case yet.</p>}
      <ul className="document-files">
        {item.files.map(file => (
          <li key={file.selector}>
            <article className="document-file">
              <div className="document-file-copy">
                {/* Curated title, shown as stored. A generic title is an Admin content-quality issue; the portal does not invent one from the filename. */}
                <h3>{file.title}</h3>
                {file.instructions ? <p className="document-file-role">Customer submission instructions</p> : null}
                <p className="document-filename">{file.filename}</p>
                <p className="document-meta">{publishedFileMeta(file)}</p>
                <p className="document-published">Published {formatPortalDate(file.publishedAt)}</p>
              </div>
              <DownloadControl href={downloadHref(item.reference, file.selector)} title={file.title} />
            </article>
          </li>
        ))}
      </ul>
      {item.footer}
    </li>
  )
}

export function SubmittedEvidence({ submissions, expanded }: { submissions: EvidenceSubmission[]; expanded: boolean }) {
  if (submissions.length === 0) {
    return <p className="documents-status">You haven&apos;t submitted any evidence yet.</p>
  }
  const groups = groupByReference(submissions)
  return (
    <details className="documents-history" {...(expanded ? { open: true } : {})}>
      <summary>Your submitted evidence ({submissions.length})</summary>
      <ul className="document-list">
        {groups.map(group => (
          <li key={group.reference} className="document-group">
            <CaseIdentity item={group.items[0]} />
            {group.items.map(item => (
              <article className="document-file" key={`${item.reference}-${item.filename}-${item.submittedAt}`}>
                <div className="document-file-copy">
                  <h3>{item.filename}</h3>
                  <p className="document-filename">{item.title}</p>
                  <p className="document-meta">
                    <span>Submitted {formatPortalDate(item.submittedAt)}</span>
                    {" · "}
                    <span>{evidenceStateLabel(item.state)}</span>
                  </p>
                </div>
              </article>
            ))}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function readyCases(documents: PublishedDocument[]): ReadyCase[] {
  return groupByReference(documents).map(group => {
    const first = group.items[0]
    return {
      reference: first.reference,
      caseType: first.caseType,
      serviceTrack: first.serviceTrack,
      businessName: first.businessName,
      locationName: first.locationName,
      guidedPack: first.serviceTrack === "GUIDED",
      files: group.items.map(item => ({
        selector: item.selector,
        title: item.title,
        filename: item.filename,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        publishedAt: item.publishedAt,
      })),
    }
  })
}

export function needsAttention(state: EvidenceState, canUpload = false) {
  return canUpload || state === "NEEDS_ANOTHER" || state === "NOT_SUBMITTED" || state === "UPLOAD_IN_PROGRESS"
}

function groupByReference<T extends { reference: string }>(items: T[]) {
  const groups: { reference: string; items: T[] }[] = []
  for (const item of items) {
    const current = groups[groups.length - 1]
    if (current && current.reference === item.reference) current.items.push(item)
    else groups.push({ reference: item.reference, items: [item] })
  }
  return groups
}
