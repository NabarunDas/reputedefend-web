"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { lifecycleLabel } from "@/lib/communications/model"
import {
  alreadySaved,
  approvalNotice,
  evidencePreviewBlocks,
  messageIsLive,
  openRequirements,
  requirementCoverage,
  requirementText,
  requirementTitle,
  splitEvidenceMessage,
  vagueEvidenceTitle,
  type JourneyDocuments,
} from "@/lib/case-journey/documents"
import { evidenceWording } from "@/lib/case-journey/wording-text"

const evidenceEndpoint = "/api/evidence/command"
const communicationEndpoint = "/api/operations/communications"
const wordingEndpoint = "/api/cases/journey/wording"

type Row = { key: string; name: string; title: string; detail: string; selected: boolean }

export function DocumentRequestPanel({ caseId, documents }: { caseId: string; documents: JourneyDocuments }) {
  const open = openRequirements(documents)
  const live = messageIsLive(documents.currentMessage)
  const historyReady = documents.history === "ready"
  const canPrepareDraft = historyReady && !live && !documents.verifiedEmailSuppressed && !!documents.verifiedEmail && open.length > 0 && documents.drafting.canDraft
  const draftBlocked = historyReady && !live && !documents.verifiedEmailSuppressed && !!documents.verifiedEmail && open.length > 0 && !documents.drafting.canDraft
  return <div className="guided-facts">
    <dl>
      <dt>Business</dt><dd>{documents.businessName}</dd>
      <dt>Issue</dt><dd>{documents.caseTypeLabel}</dd>
    </dl>
    <h3>Original request</h3>
    <p className="preserve-lines">{documents.issue}</p>
    <p>Nothing on this step sends an email.</p>
    {documents.history === "unavailable" && <p className="notice">The communication history could not be loaded. That is not the same as no email having been prepared.</p>}
    {documents.history === "incomplete" && <p className="notice">Older communications exist and are not shown, so a draft is not offered from this page.</p>}
    {documents.history === "ambiguous" && <p className="notice">The evidence-request messages disagree, so this page will not draft or review one.</p>}
    {open.length > 0 && <SavedRequirements documents={documents} open={open} />}
    {documents.verifiedEmailSuppressed && <p className="notice">This email address is suppressed. No draft is created, and nothing is sent.</p>}
    {historyReady && !documents.verifiedEmail && !documents.verifiedEmailSuppressed && open.length > 0 && !live && (
      <p className="notice">A draft needs a verified customer email. Saving a requirement does not verify the address.</p>
    )}
    {draftBlocked && documents.drafting.draftReasons.map(reason => <p key={reason} className="notice">{reason}</p>)}
    {documents.cancelledMessage && !live && <p>The last draft was cancelled. It was not sent.</p>}
    {live && documents.currentMessage && <EmailDraft key={`${documents.currentMessage.id}:${documents.currentMessage.version}`} documents={documents} />}
    {open.length === 0 && <RequirementChecklist caseId={caseId} documents={documents} />}
    {open.length > 0 && !live && historyReady && (
      <details className="guided-details">
        <summary>Add another requirement</summary>
        <p>A second request stays separate. This email covers one request and its own upload link. It does not cancel the other request.</p>
        <RequirementChecklist caseId={caseId} documents={documents} />
      </details>
    )}
    {canPrepareDraft && <DraftEmail caseId={caseId} documents={documents} requests={open} />}
    {historyReady && !live && open.map(request => <CancelRequirement key={request.id} caseId={caseId} request={request} />)}
  </div>
}

function SavedRequirements({ documents, open }: { documents: JourneyDocuments; open: ReturnType<typeof openRequirements> }) {
  const contacted = documents.currentMessage?.lifecycle === "QUEUED"
    || documents.currentMessage?.delivery === "Delivered"
    || documents.currentMessage?.delivery === "Accepted by email provider"
  const coverage = messageIsLive(documents.currentMessage) ? requirementCoverage(documents) : null
  return <>
    <h3>Saved requirements</h3>
    <p>{contacted ? "A message has been issued. Issuing it is not the same as confirmed delivery." : "Requirements saved. The customer has not been contacted."}</p>
    {coverage && coverage.omitted.length > 0 && <p>This email does not request every open requirement.</p>}
    {coverage && coverage.included && coverage.omitted.length === 0 && <p>This email names only this requirement.</p>}
    <ul className="notice-list">
      {open.map(request => <li key={request.id}>
        <h3>{request.title}</h3>
        {coverage && <p>{coverage.included?.id === request.id ? "Included in this email" : "Not included in this email"}</p>}
        <p className="preserve-lines">{request.requestText}</p>
      </li>)}
    </ul>
  </>
}

function EmailCoverage({ documents }: { documents: JourneyDocuments }) {
  const { included, omitted } = requirementCoverage(documents)
  if (!included && omitted.length === 0) return null
  return <>
    {included && <p>Included in this email: {included.title}</p>}
    {omitted.length > 0 && <p>Not included in this email: {omitted.map(request => request.title).join("; ")}.</p>}
    {omitted.length > 0 && <p>This email does not request every open requirement.</p>}
  </>
}

function EmailPreview({ recipient, subject, body }: { recipient: string; subject: string; body: string | null }) {
  const blocks = evidencePreviewBlocks(body)
  return <div className="email-preview">
    <p><span className="email-preview-label">Recipient</span> <span>{recipient}</span></p>
    <p><span className="email-preview-label">Subject</span> <span>{subject || "No subject"}</span></p>
    {blocks.length === 0 && <p>No message text.</p>}
    {blocks.map((block, index) => {
      if (block.type === "list") return <ul key={index}>{block.items.map(item => <li key={item}>{item}</li>)}</ul>
      if (block.type === "link") return <p key={index} className="email-preview-link">{block.url}</p>
      return <p key={index}>{block.text}</p>
    })}
  </div>
}

function EmailDraft({ documents }: { documents: JourneyDocuments }) {
  const message = documents.currentMessage
  const parts = splitEvidenceMessage(message?.bodyText ?? null)
  const [editing, setEditing] = useState(false)
  const [nextSubject, setNextSubject] = useState(message?.subject ?? "")
  const [nextMessage, setNextMessage] = useState(parts.prose)
  const command = useCommand()
  if (!message) return null
  const reviewed = message.lifecycle === "REVIEWED"
  const draft = message.lifecycle === "DRAFT"
  const notice = approvalNotice(documents)
  const savedSubject = message.subject || ""
  const savedProse = parts.prose
  const dirty = nextSubject.trim() !== savedSubject.trim() || nextMessage.trim() !== savedProse.trim()
  const previewSubject = command.done ? nextSubject : savedSubject
  const previewBody = command.done && parts.uploadUrl ? `${nextMessage.trim()}\n\n${parts.uploadUrl}` : message.bodyText
  const failed = message.delivery === "Failed" || message.delivery === "Suppressed" || message.delivery.startsWith("Permanently") || message.delivery.startsWith("Temporarily") || message.delivery.startsWith("Bounce") || message.delivery === "Complained"
  const approvedUnsent = reviewed && message.delivery !== "Delivered" && message.delivery !== "Accepted by email provider"
  const canEdit = draft && !!parts.uploadUrl && !command.uncertain && !command.done
  const wordingHold = editing || dirty || command.uncertain || command.done
  function cancelEditing() {
    setNextSubject(savedSubject)
    setNextMessage(savedProse)
    setEditing(false)
    if (!command.uncertain && !command.done) command.setLocalMessage("")
  }
  const saveWording = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dirty) {
      setEditing(false)
      return
    }
    if (!evidenceWording(nextSubject, nextMessage)) {
      command.setLocalMessage("Use plain wording. Leave out links. The upload link stays as it is.")
      return
    }
    const saved = await command.send("wording", wordingEndpoint, {
      communicationId: message.id,
      version: message.version,
      subject: nextSubject,
      message: nextMessage,
    })
    if (saved === "ok" || saved === "uncertain") setEditing(false)
  }
  return <section aria-labelledby="journey-email-heading">
    <h3 id="journey-email-heading">{approvedUnsent ? "Approved — Not sent" : draft ? "Email draft" : reviewed ? "Approved email" : "Evidence-request email"}</h3>
    <p>{draft ? "This is a draft. It has not been approved, and it has not been sent." : approvedUnsent ? "The customer has not been sent this email." : `${lifecycleLabel(message.lifecycle)}. ${message.delivery}.`}</p>
    {failed && <p>This email was not delivered. This page does not send it again.</p>}
    {message.lifecycle === "QUEUED" && <p>This email is waiting. This page does not send another copy.</p>}
    {message.delivery === "Delivered" && <p>Delivery is recorded.</p>}
    {message.delivery === "Accepted by email provider" && <p>The email provider accepted the message. That does not confirm the customer received it.</p>}
    <EmailCoverage documents={documents} />
    {notice.text && <p className="notice">{notice.text}</p>}
    {!editing && <EmailPreview recipient={message.recipient} subject={previewSubject} body={previewBody} />}
    {canEdit && !editing && <button type="button" onClick={() => setEditing(true)}>Edit email</button>}
    {canEdit && editing && <form className="record-form" onSubmit={saveWording}>
      <p>Edit the subject and message, then save. The upload link is not edited.</p>
      <label>Subject
        <input aria-label="Email subject" value={nextSubject} maxLength={200} onChange={event => setNextSubject(event.target.value)} />
      </label>
      <label>Message
        <textarea className="email-message" aria-label="Email message" value={nextMessage} maxLength={4000} rows={16} onChange={event => setNextMessage(event.target.value)} />
      </label>
      <p className="email-preview-label">Secure upload link</p>
      <p className="email-preview-link">{parts.uploadUrl}</p>
      <div className="email-actions">
        <button type="submit" disabled={command.busy}>Save changes</button>
        <button type="button" onClick={cancelEditing} disabled={command.busy}>Cancel editing</button>
      </div>
    </form>}
    {command.done
      ? command.message && <p role="status">{command.message}</p>
      : <CommandStatus command={command} />}
    {message.contentLocked && <p>This approved wording is kept. A later change is a new draft.</p>}
    {draft && !documents.drafting.canReview && documents.drafting.reviewReason && <p className="notice">{documents.drafting.reviewReason}</p>}
    {draft && !notice.blocked && documents.drafting.canReview && !wordingHold && <ReviewDraft messageId={message.id} version={message.version} />}
    {(draft || reviewed) && <ReplaceDraft messageId={message.id} version={message.version} />}
  </section>
}

function RequirementChecklist({ caseId, documents }: { caseId: string; documents: JourneyDocuments }) {
  const command = useCommand()
  const [rows, setRows] = useState<Row[]>(() => [
    ...documents.suggestions.map(item => ({ key: item.key, name: item.title, title: item.title, detail: item.detail, selected: item.selected })),
    { key: "other", name: "Other evidence", title: "Other evidence", detail: "", selected: false },
  ])
  const selected = rows.filter(row => row.selected)
  function update(key: string, patch: Partial<Row>) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row))
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selected.length === 0) {
      command.setLocalMessage("Select a document, or leave the list empty. An empty list is not a decision that no documents are required.")
      return
    }
    const other = selected.find(row => row.key === "other")
    if (other && (vagueEvidenceTitle(other.title) || other.detail.trim().length < 10)) {
      command.setLocalMessage("Name the document the customer should send, and describe it. “Other evidence” is not specific enough for the customer email.")
      return
    }
    const title = requirementTitle(selected)
    const requestText = requirementText(selected)
    if (!title || !requestText) {
      command.setLocalMessage("Shorten the document names. The customer email can name 200 characters, and the saved note can hold 4,000.")
      return
    }
    if (alreadySaved(title, documents.requests)) {
      command.setLocalMessage("That requirement is already saved. It was not created again, and the customer was not contacted.")
      return
    }
    await command.send("save", evidenceEndpoint, {
      operation: "create_request",
      caseId,
      title,
      requestText,
      dueAt: null,
    })
  }
  return <form className="record-form" onSubmit={save}>
    <h3>Documents to request</h3>
    <p>Choose only what this case needs. These suggestions are not required for every case, and none of them asks for a personal identity document.</p>
    <ul className="guided-checklist">
      {rows.map(row => <li key={row.key}>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={row.selected}
            aria-label={row.key === "other" ? "Include other evidence" : `Include ${row.name}`}
            onChange={event => update(row.key, { selected: event.target.checked })}
          />
          <span className="sr-only">{row.key === "other" ? "Other evidence" : "Include this requirement"}</span>
        </label>
        <label>
          {row.key === "other" ? "Other evidence title" : "Document name"}
          <input
            aria-label={row.key === "other" ? "Other evidence title" : `Document name: ${row.name}`}
            value={row.title}
            maxLength={200}
            onChange={event => update(row.key, { title: event.target.value })}
          />
        </label>
        {(row.selected || row.key === "other") && <label>
          {row.key === "other" ? "Other evidence description" : "What to ask for"}
          <textarea
            aria-label={row.key === "other" ? "Other evidence description" : `What to ask for: ${row.name}`}
            value={row.detail}
            maxLength={1000}
            rows={2}
            onChange={event => update(row.key, { detail: event.target.value })}
          />
        </label>}
      </li>)}
    </ul>
    <p>An empty list is not a decision that no documents are required. Saving records the requirement and does not email the customer.</p>
    <fieldset disabled={command.busy || command.uncertain || command.done}>
      <button type="submit" disabled={selected.length === 0}>Save evidence requirements</button>
    </fieldset>
    <CommandStatus command={command} />
  </form>
}

function DraftEmail({
  caseId, documents, requests,
}: {
  caseId: string
  documents: JourneyDocuments
  requests: ReturnType<typeof openRequirements>
}) {
  const command = useCommand()
  const [requestId, setRequestId] = useState(requests[0]?.id ?? "")
  const selected = requests.find(request => request.id === requestId) ?? null
  const omitted = requests.filter(request => request.id !== requestId)
  const vague = selected ? vagueEvidenceTitle(selected.title) : false
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || vague) {
      command.setLocalMessage("Name the document before preparing the customer email. This page does not rename a saved requirement, and it does not send an email.")
      return
    }
    await command.send("draft", communicationEndpoint, {
      operation: "draft",
      templateKey: "EVIDENCE_REQUEST",
      caseId,
      evidenceRequestId: requestId,
    })
  }
  return <form className="record-form" onSubmit={submit}>
    <p>The next action is to generate the email from the approved template. The draft is not an approved or sent message. One message names one requirement and one secure upload link.</p>
    {selected && <p>Included in this email: {selected.title}</p>}
    {vague && <p className="notice">This requirement is named “{selected?.title}”. Cancel it and save a specific document name before preparing the customer email. The saved requirement is left as it is.</p>}
    {omitted.length > 0 && <p>Not included in this email: {omitted.map(request => request.title).join("; ")}. This message does not request those requirements.</p>}
    {requests.length > 1 && <label>Requirement for this email
      <select value={requestId} onChange={event => setRequestId(event.target.value)}>
        {requests.map(request => <option key={request.id} value={request.id}>{request.title}</option>)}
      </select>
    </label>}
    {documents.verifiedEmail && <p>Recipient: {documents.verifiedEmail}</p>}
    <fieldset disabled={command.busy || command.uncertain || command.done || vague}>
      <button type="submit" disabled={vague}>Generate email draft</button>
    </fieldset>
    <CommandStatus command={command} />
  </form>
}

function ReviewDraft({ messageId, version }: { messageId: string; version: number }) {
  const command = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await command.send("review", communicationEndpoint, { operation: "review", communicationId: messageId, version })
  }
  if (command.uncertain || command.done) return <CommandStatus command={command} />
  return <form className="record-form" onSubmit={submit}>
    <fieldset disabled={command.busy}>
      <button type="submit">Approve email</button>
    </fieldset>
    <p>Approving keeps this exact wording. It does not send the email.</p>
    <CommandStatus command={command} />
  </form>
}

function ReplaceDraft({ messageId, version }: { messageId: string; version: number }) {
  const command = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await command.send("cancel", communicationEndpoint, { operation: "cancel", communicationId: messageId, version })
  }
  return <details className="guided-details">
    <summary>Replace this draft</summary>
    <p>Cancelling keeps the current wording on this message and allows a new draft. It does not send a replacement, and it does not edit the locked text.</p>
    <form className="record-form" onSubmit={submit}>
      <fieldset disabled={command.busy || command.uncertain || command.done}>
        <button type="submit">Cancel this draft</button>
      </fieldset>
      <CommandStatus command={command} />
    </form>
  </details>
}

function CancelRequirement({ caseId, request }: { caseId: string; request: { id: string; title: string; version: number } }) {
  const command = useCommand()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get("note") ?? "")
    await command.send(`cancel-${request.id}`, evidenceEndpoint, {
      operation: "cancel_request",
      caseId,
      requestId: request.id,
      version: request.version,
      note,
    })
  }
  return <details className="guided-details">
    <summary>Change the saved requirement</summary>
    <p>A saved requirement cannot be edited in place. Cancelling it, with a note, is the existing record. The customer is not contacted.</p>
    <form className="record-form" onSubmit={submit}>
      <fieldset disabled={command.busy || command.uncertain || command.done}>
        <label>Reason for cancelling {request.title}
          <textarea name="note" required minLength={10} maxLength={1000} rows={2} />
        </label>
        <button type="submit">Cancel this requirement</button>
      </fieldset>
      <CommandStatus command={command} />
    </form>
  </details>
}

function useCommand() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState("")
  const keys = useRef<Record<string, string>>({})
  const inflight = useRef(false)
  function setLocalMessage(value: string) {
    setMessage(value)
  }
  async function send(name: string, url: string, body: unknown): Promise<"ok" | "uncertain" | "rejected" | "skipped"> {
    if (busy || uncertain || done || inflight.current) return "skipped"
    inflight.current = true
    keys.current[name] ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keys.current[name] },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => ({})) as { message?: string }
      setMessage(result.message || "Unable to confirm the change.")
      if (response.ok) {
        setDone(true)
        router.refresh()
        return "ok"
      }
      if (response.status >= 500 || response.status === 409) {
        setUncertain(true)
        return "uncertain"
      }
      delete keys.current[name]
      return "rejected"
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      setUncertain(true)
      return "uncertain"
    } finally {
      inflight.current = false
      setBusy(false)
    }
  }
  return { busy, uncertain, done, message, send, setLocalMessage }
}

function CommandStatus({ command, reloadWhenDone = true }: { command: ReturnType<typeof useCommand>; reloadWhenDone?: boolean }) {
  const reload = command.uncertain || (reloadWhenDone && command.done)
  return <>
    {command.message && <p role="status">{command.message}</p>}
    {reload && <button type="button" onClick={() => window.location.reload()}>Reload this step</button>}
  </>
}

