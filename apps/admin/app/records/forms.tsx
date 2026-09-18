"use client"
import { useState, useRef, type FormEvent, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { recordPath, type Entity, type Membership, type RecordItem } from "@/lib/records/model"
export function CommandForm({ endpoint, payload, children, destination, actionUrl, submitLabel = "Save" }: { endpoint: string; payload: (form: FormData) => unknown; children: ReactNode; destination?: (id: string) => string; actionUrl?: string; submitLabel?: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [uncertain, setUncertain] = useState(false)
  const [completed, setCompleted] = useState(false)
  const commandKey = useRef<string | null>(null)
  const router = useRouter()
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || uncertain || completed) return
    const form = new FormData(event.currentTarget)
    commandKey.current ||= crypto.randomUUID()
    setBusy(true); setMessage("")
    try {
      const response = await fetch(actionUrl ?? `/api/records/${endpoint}`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": commandKey.current }, body: JSON.stringify(payload(form)) })
      const result = await response.json()
      setMessage(result.message)
      if (response.ok) { setCompleted(true); if (destination && result.id) router.push(destination(result.id)); router.refresh() }
      else if (response.status >= 500 || response.status === 409) setUncertain(true)
      else commandKey.current = null
    } catch { setMessage("We couldn’t confirm the change. Reload the record before trying again."); setUncertain(true) }
    finally { setBusy(false) }
  }
  return <form className="record-form" onSubmit={submit}><fieldset disabled={busy || uncertain || completed}>{children}<button type="submit">{busy ? "Saving…" : submitLabel}</button></fieldset><p role="status">{message}</p>{(uncertain || completed) && <button type="button" className="secondary" onClick={() => window.location.reload()}>Reload record</button>}</form>
}
export function Reason({ label = "Reason for this change", name = "reason", maxLength = 1000 }: { label?: string; name?: string; maxLength?: number }) {
  return <label>{label}<textarea name={name} required minLength={10} maxLength={maxLength} rows={3} /><span className="muted">Use a brief factual note. Don’t include passwords, codes or sensitive document contents.</span></label>
}
export function RecordForm({ entity, record, businessId }: { entity: Entity; record?: RecordItem; businessId?: string }) {
  return <CommandForm endpoint="save" destination={id => recordPath(entity, id)} payload={form => ({ entity, id: record?.id || null, version: record?.version || 0, reason: form.get("reason"), data: entity === "client" ? { name: form.get("name"), email: form.get("email"), phone: form.get("phone") } : entity === "business" ? { name: form.get("name"), website: form.get("website") } : { name: form.get("name"), country: form.get("country"), profileUrl: form.get("profileUrl"), businessId: record?.businessId || businessId } })}>
    <label>{entity === "client" ? "Full name" : entity === "business" ? "Business name" : "Location name (optional)"}<input name="name" required={entity !== "location"} maxLength={200} defaultValue={record?.name || ""} /></label>
    {entity === "client" && <><label>Email address<input name="email" type="email" required maxLength={254} defaultValue={record?.email || ""} /></label><label>Phone number (optional)<input name="phone" type="tel" maxLength={50} defaultValue={record?.phone || ""} /></label><p className="muted">Changing a contact detail removes its verification. Changing an email also puts verified business relationships back into review and requires a sign-in within the last five minutes.</p></>}
    {entity === "business" && <label>Website (optional)<input name="website" type="url" maxLength={2048} defaultValue={record?.website || ""} /></label>}
    {entity === "location" && <><label>Country<input name="country" required maxLength={100} defaultValue={record?.country || ""} /></label><label>Google Business Profile URL (optional)<input name="profileUrl" type="url" maxLength={2048} defaultValue={record?.profileUrl || ""} /></label><p className="muted">This location stays linked to its business so existing case and monitoring records keep their meaning.</p></>}
    <Reason />
  </CommandForm>
}
export function VerifyContactForm({ record }: { record: RecordItem }) {
  return <CommandForm endpoint="verify" payload={form => ({ customerId: record.id, version: record.version, channel: form.get("channel"), evidence: form.get("evidence") })}>
    <p>Record a contact check you have already completed. This does not send a message or give the customer portal access.</p>
    <label>Contact checked<select name="channel"><option value="email">Email: {record.email}</option>{record.phone && <option value="phone">Phone: {record.phone}</option>}</select></label>
    <Reason name="evidence" label="How did you confirm this contact? Include the date and evidence reference." />
    <label className="checkbox"><input type="checkbox" required />I checked that the customer controls this contact method.</label>
    <p className="muted">Requires an admin sign-in within the last five minutes.</p>
  </CommandForm>
}
export function MembershipForm({ customerId, businessId, membership }: { customerId: string; businessId: string; membership?: Membership }) {
  return <CommandForm endpoint="membership" payload={form => ({ customerId, businessId, version: membership?.version || 0, status: form.get("status"), evidence: form.get("evidence") })}>
    <label>Relationship status<select name="status" defaultValue={membership?.status || "pending"}><option value="pending">Awaiting authority check</option><option value="verified">Authority verified</option><option value="revoked">Access withdrawn</option></select></label>
    <Reason name="evidence" label="Reason and evidence for this relationship" />
    <label className="checkbox"><input type="checkbox" required />I checked the client and business and have evidence for this status.</label>
    <p className="muted">Authority verification requires a verified email or phone and a recent admin sign-in. A submitted enquiry alone is not proof of authority.</p>
  </CommandForm>
}
