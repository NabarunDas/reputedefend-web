import { ActionNeeded, ReadyForYou, SubmittedEvidence, readyCases } from "./document-sections"
import type { CustomerDocuments } from "@/lib/portal/documents/parse"

export function DocumentsUnavailable() {
  return (
    <div className="documents-page state-panel">
      <h1>We couldn&apos;t load your documents</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal">Back to your dashboard</a></p>
    </div>
  )
}

export function DocumentsView({ documents }: { documents: CustomerDocuments }) {
  const actionNeeded = documents.needs.length > 0
  return (
    <div className="documents-page">
      <h1>Documents</h1>
      <p className="lead">What is ready for you, what still needs you, and the evidence you have sent.</p>
      <ActionNeeded needs={documents.needs} />
      <ReadyForYou cases={readyCases(documents.documents)} />
      <SubmittedEvidence submissions={documents.submissions} expanded={actionNeeded} />
    </div>
  )
}
