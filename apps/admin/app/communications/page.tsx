import { ukDate } from "@/lib/admin/activity"
import { loadCommunications } from "@/lib/communications/queries"
import { deliveryLabel, lifecycleLabel, templateLabel } from "@/lib/communications/model"
import { Badge, EmptyState, PageHeader } from "../ui"
import { communicationsSendEnabled, sendDisabledReason } from "@/lib/communications/gate"
import { DraftCommunicationForm, QueueCommunicationForm, ResendDraftForm, ReviewCommunicationForm } from "./forms"

export const metadata = { title: "Communications" }

function deliveryTone(label: string): "success" | "warning" | "danger" | "neutral" {
  if (label === "Delivered") return "success"
  if (label.startsWith("Accepted by email provider")) return "warning"
  if (label === "Bounced" || label === "Complained" || label === "Suppressed" || label.startsWith("Failed")) return "danger"
  return "neutral"
}

export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<{ case?: string | string[] }> }) {
  const params = await searchParams
  const caseId = typeof params.case === "string" ? params.case : null
  const data = await loadCommunications(caseId)
  const sendEnabled = communicationsSendEnabled()
  return <section className="page">
    <PageHeader title="Communications" description="Reviewed outbound customer email. Provider acceptance is not delivery. Live sending is blocked until the production worker can run at an operationally acceptable cadence." />
    <section className="panel">
      <h2>Draft</h2>
      <p className="muted">{sendDisabledReason()}</p>
      <DraftCommunicationForm caseId={caseId || undefined} />
    </section>
    <section className="panel">
      <h2>{caseId ? "Case communications" : "Recent communications"}</h2>
      {!data.communications.length ? <EmptyState>No communications recorded yet.</EmptyState> : <div className="table-scroll" role="region" aria-label="Communications" tabIndex={0}>
        <table>
          <thead><tr><th>Type</th><th>Recipient</th><th>Lifecycle</th><th>Delivery</th><th>When</th><th>Events</th></tr></thead>
          <tbody>{data.communications.map(row => <tr key={row.id}>
            <td>
              {templateLabel(row.templateKey)}<br />
              <span className="muted">{row.caseReference || row.communicationType}</span><br />
              <span className="muted">{row.subject}</span>
            </td>
            <td>{row.recipient}</td>
            <td><Badge>{lifecycleLabel(row.lifecycle)}</Badge></td>
            <td>
              <Badge tone={deliveryTone(deliveryLabel(row))}>{deliveryLabel(row)}</Badge>
              {row.providerMessageId && <><br /><span className="muted">{row.providerMessageId}</span></>}
              {row.lastError && <><br /><span className="muted">{row.lastError}</span></>}
            </td>
            <td>
              Drafted {ukDate(row.draftedAt)}
              {row.reviewedAt && <><br />Reviewed {ukDate(row.reviewedAt)}</>}
              {row.queuedAt && <><br />Queued {ukDate(row.queuedAt)}</>}
              {row.firstProviderAttemptAt && <><br />First provider attempt {ukDate(row.firstProviderAttemptAt)}</>}
              {row.providerAcceptedAt && <><br />Provider accepted {ukDate(row.providerAcceptedAt)}</>}
              {row.deliveredAt && <><br />Delivered {ukDate(row.deliveredAt)}</>}
            </td>
            <td>
              {row.events.length ? row.events.map(event => <p key={event.occurredAt + event.eventType} className="muted">{event.eventType}: {event.summary}</p>) : "—"}
              {row.lifecycle === "DRAFT" && <ReviewCommunicationForm communicationId={row.id} version={row.version} />}
              {row.lifecycle === "REVIEWED" && sendEnabled && <QueueCommunicationForm communicationId={row.id} version={row.version} />}
              {row.lifecycle === "REVIEWED" && !sendEnabled && <p className="muted">Queueing is closed until live customer mail is enabled.</p>}
              {(row.deliveryStatus === "BOUNCED" || row.deliveryStatus === "COMPLAINED" || row.deliveryStatus === "SUPPRESSED" || row.deliveryStatus === "FAILED") && row.caseId && (
                <ResendDraftForm communicationId={row.id} caseId={row.caseId} />
              )}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </section>
}
