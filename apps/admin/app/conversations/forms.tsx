"use client"
import { useRef, useState, type FormEvent, type ReactNode } from "react"

async function post(operation: string, body: Record<string, unknown>, key: string) {
  const response = await fetch("/api/operations/conversations", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ operation, ...body }),
  })
  const result = await response.json() as { message?: string }
  return { ok: response.ok, message: result.message || "" }
}

function ConversationForm({
  operation,
  conversationId,
  version,
  label,
  children,
}: {
  operation: string
  conversationId: string
  version?: number
  label: string
  children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const commandKey = useRef<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const extra: Record<string, unknown> = {}
      for (const [name, value] of form.entries()) extra[name] = String(value)
      const result = await post(operation, {
        conversationId,
        version,
        ...extra,
      }, commandKey.current)
      setMessage(result.message)
      if (result.ok) window.location.reload()
      else commandKey.current = null
    } catch {
      setMessage("We couldn’t save that conversation. Reload the page and try again.")
      commandKey.current = null
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit}>
    {children}
    <button type="submit" disabled={busy}>{busy ? "Saving…" : label}</button>
    {message && <p className="muted">{message}</p>}
  </form>
}

export function LinkCaseForm({ conversationId, version }: { conversationId: string; version: number }) {
  return <ConversationForm operation="link_case" conversationId={conversationId} version={version} label="Link to case">
    <label>Case ID<input name="caseId" required maxLength={36} /></label>
  </ConversationForm>
}

export function UnlinkCaseForm({ conversationId, version }: { conversationId: string; version: number }) {
  return <ConversationForm operation="unlink_case" conversationId={conversationId} version={version} label="Unlink case" />
}

export function AssignForm({ conversationId, version, assigned }: { conversationId: string; version: number; assigned: boolean }) {
  return <ConversationForm operation={assigned ? "unassign" : "assign"} conversationId={conversationId} version={version} label={assigned ? "Unassign" : "Assign to me"} />
}

export function CloseForm({ conversationId, version, state }: { conversationId: string; version: number; state: string }) {
  if (state === "CLOSED") return <ConversationForm operation="reopen" conversationId={conversationId} version={version} label="Reopen" />
  if (state === "OPEN" || state === "UNMATCHED") return <ConversationForm operation="close" conversationId={conversationId} version={version} label="Close" />
  return null
}

export function AttentionForm({ conversationId, version, needsAttention }: { conversationId: string; version: number; needsAttention: boolean }) {
  return <ConversationForm operation="attention" conversationId={conversationId} version={version} label={needsAttention ? "Mark read" : "Needs attention"}>
    <input type="hidden" name="needsAttention" value={needsAttention ? "false" : "true"} />
  </ConversationForm>
}

export function PhoneNoteForm({ conversationId }: { conversationId: string }) {
  return <ConversationForm operation="phone_note" conversationId={conversationId} label="Record phone note">
    <label>Direction
      <select name="direction" defaultValue="NOTE">
        <option value="NOTE">Note</option>
        <option value="INBOUND">Customer called</option>
        <option value="OUTBOUND">We called</option>
      </select>
    </label>
    <label>Note<textarea name="note" required minLength={3} maxLength={4000} rows={3} /></label>
  </ConversationForm>
}

export function ContactRecoveryForm({ conversationId, version }: { conversationId: string; version: number }) {
  return <ConversationForm operation="contact_recovery" conversationId={conversationId} version={version} label="Create contact recovery task">
    <label>Task kind
      <select name="kind" defaultValue="CALL">
        <option value="CALL">Call</option>
        <option value="FOLLOW_UP">Follow up</option>
      </select>
    </label>
  </ConversationForm>
}

export function DraftReplyForm({ conversationId, version }: { conversationId: string; version: number }) {
  return <ConversationForm operation="draft_reply" conversationId={conversationId} version={version} label="Draft reply">
    <label>Reply<textarea name="bodyText" required minLength={10} maxLength={4000} rows={4} /></label>
    <p className="muted">Queueing stays closed. This uses the reviewed outgoing-mail path and will not send.</p>
  </ConversationForm>
}

export function PromoteAttachmentForm({ conversationId, version, attachmentId }: { conversationId: string; version: number; attachmentId: string }) {
  return <ConversationForm operation="promote_attachment" conversationId={conversationId} version={version} label="Record for evidence follow-up">
    <input type="hidden" name="attachmentId" value={attachmentId} />
  </ConversationForm>
}
