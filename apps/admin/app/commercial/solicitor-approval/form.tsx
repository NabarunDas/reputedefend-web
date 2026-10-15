"use client"

import { useRef, useState, type FormEvent } from "react"

const VERSION = "PS-2026-10-14.2"
const HASH = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"
const SUGGESTED_REFERENCE = "Solicitor approval email dated 15 October 2026, subject: PS-2026-10-14.2 - Approval"

export function SolicitorApprovalForm() {
  const [reference, setReference] = useState(SUGGESTED_REFERENCE)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [approved, setApproved] = useState(false)
  const key = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !confirmed || approved) return
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/operations/solicitor-approval", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({ version: VERSION, contentHash: HASH, evidence: reference, confirmed: true }),
      })
      const data = await response.json() as { message?: string; version?: string; contentHash?: string; operative?: boolean }
      if (response.ok && data.version === VERSION && data.contentHash === HASH && data.operative === true) {
        setApproved(true)
        setMessage(data.message || "Approval recorded.")
      } else {
        setMessage(data.message || "Could not confirm this approval.")
        key.current = null
      }
    } catch {
      setMessage("Could not verify the approval. Check Admin status before trying again.")
      key.current = null
    } finally { setBusy(false) }
  }

  return <form onSubmit={submit}>
    <label>Original solicitor approval email reference
      <textarea name="evidence" rows={3} minLength={20} maxLength={500} required
        value={reference} onChange={e => setReference(e.target.value)} disabled={approved} />
    </label>
    <p className="muted">The date and subject above are owner-supplied. Verify against the original solicitor email and correct this reference if needed. This does not upload or authenticate the email itself.</p>
    <label className="checkbox">
      <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={approved} />
      I have the actual solicitor approval, and it explicitly covers this unchanged agreement version and SHA-256 hash.
    </label>
    <button type="submit" disabled={!confirmed || busy || approved}>
      {approved ? "Approval recorded" : busy ? "Recording…" : "Record solicitor approval"}
    </button>
    {message && <p role="status">{message}</p>}
  </form>
}
