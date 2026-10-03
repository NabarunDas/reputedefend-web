import Link from "next/link"
import { ukDate } from "@/lib/admin/activity"
import type { CommunicationsWorkspaceModel } from "@/lib/communications-workspace/model"
import { deliveryLabel, lifecycleLabel, type DeliveryStatus } from "@/lib/communications/model"
import { conversationStateLabel, senderMatchLabel } from "@/lib/conversations/model"
import type { CaseDetail } from "@/lib/cases/model"
import { Badge } from "../../../ui"
import { QueueCommunicationForm, ResendDraftForm, ReviewCommunicationForm } from "../../../communications/forms"
import {
  AssignForm, AttentionForm, CloseForm, ContactRecoveryForm, DraftReplyForm, PhoneNoteForm, PromoteAttachmentForm,
} from "../../../conversations/forms"
import { CaseEvidenceRequestDraftForm, CaseUpdateDraftForm, ReconcileAcceptanceForm } from "./forms"

function CaseAction({ model }: { model: CommunicationsWorkspaceModel }) {
  const action = model.caseAction
  if (action.kind === "none") return null
  return <section className="panel" aria-labelledby="communications-next-heading">
    <h2 id="communications-next-heading">Next action</h2>
    <p className="commercial-headline">{action.label}</p>
    <p>{action.description}</p>
    {action.kind === "here" && action.withheld && <p className="notice-danger">{action.withheld}</p>}
    {action.kind === "elsewhere" && (action.href
      ? <p><Link href={action.href}>{action.destinationLabel || "Open the next action"}</Link></p>
      : <p className="notice-danger">That next action does not have a safe destination on this site.</p>)}
  </section>
}

function roleLabel(role: "current" | "superseded" | "earlier"): string {
  if (role === "current") return "Current"
  if (role === "superseded") return "Superseded"
  return "Earlier"
}

export function CommunicationsWorkspace({ caseDetail, model }: { caseDetail: CaseDetail; model: CommunicationsWorkspaceModel }) {
  const current = model.communications.find(row => row.id === model.currentCommunicationId) ?? null
  return <>
    {model.notices.map(notice => <p key={notice} className="notice-danger" role="status">{notice}</p>)}
    <CaseAction model={model} />
    <section className="panel" aria-labelledby="communications-situation-heading">
      <h2 id="communications-situation-heading">Contact and delivery</h2>
      <p className="commercial-headline">{model.situation}</p>
      {model.situationNote && <p>{model.situationNote}</p>}
      {model.waitingNote && <p>{model.waitingNote}</p>}
      {model.sendBlocked && <p>{model.sendBlockedReason}</p>}
    </section>

    {model.commands.draftEvidenceRequest && <section className="panel" aria-labelledby="draft-evidence-heading">
      <h2 id="draft-evidence-heading">Draft the evidence request</h2>
      <CaseEvidenceRequestDraftForm caseId={caseDetail.id} requests={model.evidenceRequests} />
    </section>}

    {current && model.commands.reviewEvidenceRequest && <section className="panel">
      <h2>Review the draft</h2>
      <p className="muted">Review checks the drafted message. It does not send it.</p>
      <ReviewCommunicationForm communicationId={current.id} version={current.version} />
    </section>}

    {current && model.commands.queueEvidenceRequest && <section className="panel">
      <h2>Queue the reviewed message</h2>
      <QueueCommunicationForm communicationId={current.id} version={current.version} />
    </section>}

    {current && model.commands.reconcileAcceptance && <section className="panel" aria-labelledby="reconcile-heading">
      <h2 id="reconcile-heading">Reconcile provider acceptance</h2>
      <ReconcileAcceptanceForm caseId={caseDetail.id} communicationId={current.id} version={current.version} />
    </section>}

    {model.recovery?.show && <section className="panel" aria-labelledby="recovery-heading">
      <h2 id="recovery-heading">Contact recovery required</h2>
      <p>The existing address cannot simply be retried.</p>
      {model.recovery.recipient && <p>Failed recipient snapshot: {model.recovery.recipient}</p>}
      {model.recovery.reason && <p>Failure: {model.recovery.reason}</p>}
      {model.recovery.verifiedEmail && <p>Verified email on the client record: {model.recovery.verifiedEmail}{model.recovery.verifiedEmailSuppressed ? " — suppressed" : ""}</p>}
      <p>{model.recovery.replacementNote}</p>
      <p className="muted">{model.recovery.limitation}</p>
      {model.recovery.clientHref && <p><Link href={model.recovery.clientHref}>Open the client record</Link> to establish and verify a different email. This page cannot type a replacement address.</p>}
      {current && model.commands.replaceDraft && <>
        <p>The replacement is a draft. It has not been sent.</p>
        <ResendDraftForm communicationId={current.id} caseId={caseDetail.id} />
      </>}
    </section>}

    <section className="panel" aria-labelledby="outbound-heading">
      <h2 id="outbound-heading">Outbound communications</h2>
      {model.communications.length === 0
        ? <p className="muted">{model.notices.some(notice => /could not be loaded|incomplete|disagree/i.test(notice)) ? "No outbound rows are shown from this read." : "No outbound communications are recorded for this case."}</p>
        : model.communications.map(row => <article key={row.id}>
          <h3>{row.purpose}{row.subject ? ` — ${row.subject}` : ""}</h3>
          <p><Badge>{roleLabel(row.role)}</Badge> <Badge>{row.lifecycle}</Badge> <Badge tone={row.delivery.startsWith("Delivered") ? "success" : row.delivery.startsWith("Accepted") ? "warning" : "neutral"}>{row.delivery}</Badge></p>
          {row.deliveryClarification && <p>{row.deliveryClarification}</p>}
          <p>Recipient snapshot: {row.recipient}</p>
          {row.lastError && <p className="muted">{row.lastError}</p>}
          <ul>
            {row.moments.map(moment => <li key={moment.label}>{moment.label} {ukDate(moment.at)}</li>)}
          </ul>
          {row.events.length > 0 && <ul>
            {row.events.map(event => <li key={`${event.eventType}-${event.occurredAt}`}>{event.summary} · {ukDate(event.occurredAt)}</li>)}
          </ul>}
          {row.eventsTruncated && <p className="muted">Older delivery events exist and are not shown.</p>}
          {(row.providerMessageId || row.id) && <details>
            <summary>Technical references</summary>
            {row.providerMessageId && <p className="muted">Provider message id: {row.providerMessageId}</p>}
            <p className="muted">Communication id: {row.id}</p>
          </details>}
          {row.bodyText && <details>
            <summary>Message text</summary>
            <p className="preserve-lines">{row.bodyText}</p>
          </details>}
        </article>)}
    </section>

    {model.caseUpdateAllowed && <section className="panel">
      <h2>Case update</h2>
      <CaseUpdateDraftForm caseId={caseDetail.id} />
    </section>}

    <section className="panel" aria-labelledby="conversations-heading">
      <h2 id="conversations-heading">Conversations</h2>
      <p className="muted">Only conversations linked to this case. Unmatched mail stays on the Conversations inbox. <Link href="/conversations">Open the inbox</Link>.</p>
      {model.conversations.length === 0
        ? <p className="muted">No case-linked conversations are in this read.</p>
        : <ul>{model.conversations.map(row => <li key={row.id}>
          <Link href={row.href}>{row.subject || "No subject"}</Link>
          {" — "}{row.sender || "Unknown sender"}
          {" · "}{row.stateLabel}
          {row.needsAttention ? " · Needs attention" : ""}
          {row.assignedAdminId ? " · Assigned" : " · Unassigned"}
          {row.hasAttachment ? " · Has attachment" : ""}
          <br /><span className="muted">{row.senderLabel}</span>
        </li>)}</ul>}
      {model.selected.kind === "foreign" && <p className="notice-danger" role="status">That conversation belongs to another case. Its contents are not shown.</p>}
      {model.selected.kind === "unavailable" && <p className="notice-danger" role="status">That conversation could not be loaded. It is not treated as empty.</p>}
      {model.selected.kind === "disagree" && <p className="notice-danger" role="status">That conversation is not in this case’s conversation list. Its contents are not shown.</p>}
      {model.selected.kind === "open" && <ConversationThread caseId={caseDetail.id} model={model} detail={model.selected.detail} />}
    </section>
  </>
}

function ConversationThread({
  caseId, model, detail,
}: {
  caseId: string
  model: CommunicationsWorkspaceModel
  detail: Extract<CommunicationsWorkspaceModel["selected"], { kind: "open" }>["detail"]
}) {
  const conversation = detail.conversation
  return <article>
    <h3>{conversation.subject || "Conversation"}</h3>
    <p className="muted">{conversationStateLabel(conversation.state)}.</p>
    {conversation.recipientSuppressed && <p>The linked case contact is suppressed. Create a contact recovery task instead of sending another email. A match to a verified contact does not authenticate the sender.</p>}
    {detail.entries.map(entry => <section key={entry.id}>
      <h4>{entry.kind === "PHONE_NOTE" ? "Phone note" : entry.kind === "OUTBOUND_EMAIL" ? "Outgoing reply" : "Inbound email"}</h4>
      {entry.kind === "INBOUND_EMAIL" && <p>{senderMatchLabel(entry.senderMatch || "NONE")}</p>}
      {entry.kind === "OUTBOUND_EMAIL" && <p>
        {lifecycleLabel(entry.lifecycle ?? null)}
        {entry.deliveryStatus ? ` · ${deliveryLabel({ deliveryStatus: entry.deliveryStatus as DeliveryStatus, legacyStatus: null })}` : ""}
        {entry.deliveryStatus === "PROVIDER_ACCEPTED" && " Delivery is not yet confirmed."}
      </p>}
      <p className="preserve-lines">{entry.bodyText || "No plain-text body."}</p>
      {entry.lifecycle === "DRAFT" && entry.version && <ReviewCommunicationForm communicationId={entry.id} version={entry.version} />}
      {entry.lifecycle === "REVIEWED" && !model.liveMailEnabled && <p className="muted">Queueing is closed until live customer mail is enabled. This reply has not been sent.</p>}
      {entry.lifecycle === "REVIEWED" && model.liveMailEnabled && !conversation.recipientSuppressed && entry.version && (
        <QueueCommunicationForm communicationId={entry.id} version={entry.version} />
      )}
      {entry.attachments?.map(attachment => <div key={attachment.id}>
        <p className="muted">
          {attachment.filename}
          {attachment.available ? " — available after a clean scan" : " — blocked until a clean scan"}
          . Recording it for evidence follow-up does not make it accepted evidence.
        </p>
        {attachment.available && attachment.promotionState === "NONE" && (
          <PromoteAttachmentForm conversationId={conversation.id} version={conversation.version} attachmentId={attachment.id} />
        )}
        {attachment.promotionState === "RECORDED" && <p className="muted">Recorded for evidence follow-up. This is not accepted evidence.</p>}
      </div>)}
    </section>)}
    <AssignForm conversationId={conversation.id} version={conversation.version} assigned={!!conversation.assignedAdminId} />
    <CloseForm conversationId={conversation.id} version={conversation.version} state={conversation.state} />
    <AttentionForm conversationId={conversation.id} version={conversation.version} needsAttention={conversation.needsAttention} />
    <PhoneNoteForm conversationId={conversation.id} />
    {conversation.caseId === caseId && <ContactRecoveryForm conversationId={conversation.id} version={conversation.version} />}
    {conversation.state === "OPEN" && !conversation.recipientSuppressed && (
      <DraftReplyForm conversationId={conversation.id} version={conversation.version} />
    )}
    <details>
      <summary>Technical references</summary>
      <p className="muted">Conversation id: {conversation.id}</p>
    </details>
  </article>
}
