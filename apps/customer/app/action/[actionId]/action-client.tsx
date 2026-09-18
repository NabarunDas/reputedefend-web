"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { ACTION_UNAVAILABLE } from "@/lib/access"

const SERVICE_ACCEPTANCE = "I have read and agree to this service agreement and scope."
const PERMISSION_ACCEPTANCE = "I authorise ProfileRelaunch to carry out the agreed case-management work described in this permission. This is not payment, Google Manager access, or permission to submit."

type Session = {
  actionId: string
  kind: string
  status: string
  maskedEmail: string
  caseReference?: string
  businessName?: string
  locationName?: string | null
  agreement?: { title: string; body: string; scope: string; kind: string } | null
  authorization?: { id: string; kind: string; status: string } | null
}

export function ActionClient({ actionId }: { actionId: string }) {
  const [phase, setPhase] = useState<"start" | "otp" | "review" | "done" | "unavailable">("start")
  const [message, setMessage] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const exchanged = useRef(false)
  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true
    const hash = window.location.hash
    const secret = hash.startsWith("#t=") ? hash.slice(3) : ""
    history.replaceState(null, "", window.location.pathname + window.location.search)
    const timer = window.setTimeout(() => {
      if (!secret) { setPhase("unavailable"); return }
      void fetch("/api/action/exchange", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, secret }),
      }).then(async response => {
        const result = await response.json() as { status?: string; maskedEmail?: string }
        if (!response.ok || result.status !== "ok") { setPhase("unavailable"); return }
        setMaskedEmail(result.maskedEmail || "")
        setPhase("otp")
      }).catch(() => setPhase("unavailable"))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [actionId])

  async function sendOtp(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    const response = await fetch("/api/action/otp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const result = await response.json() as { message?: string; maskedEmail?: string }
    if (!response.ok) { if (response.status === 429) setMessage(result.message || ACTION_UNAVAILABLE); else setPhase("unavailable"); return }
    setMaskedEmail(result.maskedEmail || maskedEmail)
    setMessage("Enter the six-digit code sent to the verified email.")
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    const code = new FormData(event.currentTarget).get("code")
    const response = await fetch("/api/action/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
    const result = await response.json() as { message?: string; session?: Session }
    if (!response.ok || !result.session) { setPhase("unavailable"); return }
    setSession(result.session)
    setPhase("review")
  }
  async function decide(operation: "accept" | "decline" | "revoke", extra: Record<string, unknown>) {
    setMessage("")
    const response = await fetch("/api/action/command", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ operation, ...extra }),
    })
    if (!response.ok) { setPhase("unavailable"); return }
    setPhase("done")
    setMessage(operation === "decline" ? "You declined this action." : "This action is complete.")
  }

  if (phase === "unavailable") return <section><h1>Secure action</h1><p>{ACTION_UNAVAILABLE}</p></section>
  if (phase === "start") return <section><h1>Secure action</h1><p className="muted">Checking this link…</p></section>
  if (phase === "otp") return <section>
    <h1>Confirm it is you</h1>
    <p>A one-time code will be sent to {maskedEmail || "the verified email for this action"}.</p>
    <form onSubmit={sendOtp}><button type="submit">Send code</button></form>
    <form onSubmit={verify}>
      <label>Six-digit code<input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" /></label>
      <button type="submit">Verify code</button>
    </form>
    <p role="status">{message}</p>
  </section>
  if (phase === "done") return <section><h1>Secure action</h1><p>{message}</p></section>
  const agreement = session?.agreement
  const permission = agreement?.kind === "CASE_MANAGEMENT_PERMISSION"
  return <section>
    <h1>{agreement?.title || "Review this action"}</h1>
    <p>{session?.caseReference} · {session?.businessName}{session?.locationName ? ` · ${session.locationName}` : ""}</p>
    {agreement && <>
      <h2>Agreement</h2>
      <p className="preserve-lines">{agreement.body}</p>
      <h2>Scope</h2>
      <p className="preserve-lines">{agreement.scope}</p>
      <div className="button-row">
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true" }) }}>
          <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />{permission ? PERMISSION_ACCEPTANCE : SERVICE_ACCEPTANCE}</label>
          <button type="submit">Accept</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button type="submit">Decline</button></form>
      </div>
    </>}
    {session?.kind === "AUTHORIZATION_REVOCATION" && session.authorization && <form onSubmit={event => { event.preventDefault(); void decide("revoke", { confirmed: true }) }}>
      <p>This will revoke the current {session.authorization.kind} authorisation. It does not refund a payment.</p>
      <button type="submit">Revoke authorisation</button>
    </form>}
    <p role="status">{message}</p>
  </section>
}
