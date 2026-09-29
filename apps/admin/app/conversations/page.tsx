import Link from "next/link"
import { ukDate } from "@/lib/admin/activity"
import { loadConversation, loadConversations } from "@/lib/conversations/queries"
import { conversationStateLabel, senderMatchLabel } from "@/lib/conversations/model"
import { inboundDisabledReason } from "@/lib/conversations/gate"
import { communicationsSendEnabled, sendDisabledReason } from "@/lib/communications/gate"
import { Badge, EmptyState, PageHeader } from "../ui"
import { ReviewCommunicationForm } from "../communications/forms"
import {
  AssignForm, AttentionForm, CloseForm, ContactRecoveryForm, DraftReplyForm,
  LinkCaseForm, PhoneNoteForm, PromoteAttachmentForm, UnlinkCaseForm,
} from "./forms"

export const metadata = { title: "Conversations" }

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[]; conversation?: string | string[] }> }) {
  const params = await searchParams
  const filter = typeof params.filter === "string" ? params.filter : null
  const selectedId = typeof params.conversation === "string" ? params.conversation : null
  const list = await loadConversations(filter)
  const detail = selectedId ? await loadConversation(selectedId) : null
  const sendEnabled = communicationsSendEnabled()
  return <section className="page">
    <PageHeader title="Conversations" description="Inbound mail, unmatched triage, phone notes and reviewed replies. An email address is never authentication." />
    <p className="muted">{inboundDisabledReason()}</p>
    <p className="muted">{sendDisabledReason()}</p>
    <section className="panel">
      <h2>Inbox</h2>
      <p>
        <Link href="/conversations">All</Link>
        {" · "}<Link href="/conversations?filter=UNMATCHED">Unmatched</Link>
        {" · "}<Link href="/conversations?filter=OPEN">Open</Link>
        {" · "}<Link href="/conversations?filter=CLOSED">Closed</Link>
        {" · "}<Link href="/conversations?filter=NEEDS_ATTENTION">Needs attention</Link>
      </p>
      {!list.conversations.length ? <EmptyState>No conversations in this view.</EmptyState> : <div className="table-scroll" role="region" aria-label="Conversations" tabIndex={0}>
        <table>
          <thead><tr><th>Sender</th><th>Subject</th><th>State</th><th>Case</th><th>Received</th></tr></thead>
          <tbody>{list.conversations.map(row => <tr key={row.id}>
            <td>
              <Link href={`/conversations?conversation=${row.id}`}>{row.sender || "Unknown sender"}</Link><br />
              <span className="muted">{senderMatchLabel(row.senderMatch)}</span>
            </td>
            <td>
              {row.subject || "No subject"}
              {row.hasAttachment && <><br /><span className="muted">Has attachment</span></>}
            </td>
            <td>
              <Badge>{conversationStateLabel(row.state)}</Badge>
              {row.needsAttention && <><br /><Badge tone="warning">Needs attention</Badge></>}
              {row.assignedAdminId && <><br /><span className="muted">Assigned</span></>}
            </td>
            <td>{row.caseReference || "Not linked"}</td>
            <td>{ukDate(row.receivedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    {detail && <section className="panel">
      <h2>{detail.conversation.subject || "Conversation"}</h2>
      <p className="muted">State: {conversationStateLabel(detail.conversation.state)}. Case: {detail.conversation.caseReference || "unlinked"}.</p>
      {detail.conversation.recipientSuppressed && <p className="muted">The linked case contact is suppressed. Create a contact recovery task instead of sending another email.</p>}
      <div className="table-scroll" role="region" aria-label="Conversation thread" tabIndex={0}>
        {detail.entries.map(entry => <article key={entry.id}>
          <h3>{entry.kind === "PHONE_NOTE" ? "Phone note" : entry.kind === "OUTBOUND_EMAIL" ? "Outgoing email" : "Inbound email"}</h3>
          <p className="muted">{entry.subject}</p>
          {entry.kind === "INBOUND_EMAIL" && <p className="muted">{senderMatchLabel(entry.senderMatch || "NONE")}</p>}
          {entry.loopClass && entry.loopClass !== "NONE" && <p className="muted">Classified as a loop or automated message. No automatic reply was sent.</p>}
          <p>{entry.bodyText || "No plain-text body."}</p>
          {entry.lifecycle && <p className="muted">Lifecycle {entry.lifecycle}{entry.deliveryStatus ? ` · ${entry.deliveryStatus}` : ""}</p>}
          {entry.lifecycle === "DRAFT" && entry.version && <ReviewCommunicationForm communicationId={entry.id} version={entry.version} />}
          {entry.lifecycle === "REVIEWED" && !sendEnabled && <p className="muted">Queueing is closed until live customer mail is enabled.</p>}
          {entry.attachments?.map(attachment => <div key={attachment.id}>
            <p className="muted">
              {attachment.filename}
              {attachment.available ? " — available after a clean scan" : " — blocked until a clean scan"}
            </p>
            {attachment.available && attachment.promotionState === "NONE" && detail.conversation.caseId && (
              <PromoteAttachmentForm conversationId={detail.conversation.id} version={detail.conversation.version} attachmentId={attachment.id} />
            )}
          </div>)}
        </article>)}
      </div>
      {detail.conversation.state === "UNMATCHED" && <LinkCaseForm conversationId={detail.conversation.id} version={detail.conversation.version} />}
      {detail.conversation.state !== "UNMATCHED" && <UnlinkCaseForm conversationId={detail.conversation.id} version={detail.conversation.version} />}
      <AssignForm conversationId={detail.conversation.id} version={detail.conversation.version} assigned={!!detail.conversation.assignedAdminId} />
      <CloseForm conversationId={detail.conversation.id} version={detail.conversation.version} state={detail.conversation.state} />
      <AttentionForm conversationId={detail.conversation.id} version={detail.conversation.version} needsAttention={detail.conversation.needsAttention} />
      <PhoneNoteForm conversationId={detail.conversation.id} />
      {detail.conversation.caseId && <ContactRecoveryForm conversationId={detail.conversation.id} version={detail.conversation.version} />}
      {detail.conversation.state === "OPEN" && <DraftReplyForm conversationId={detail.conversation.id} version={detail.conversation.version} />}
    </section>}
  </section>
}
