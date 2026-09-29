"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ACTION_UNAVAILABLE } from "@/lib/access"

const SERVICE_ACCEPTANCE = "I have read and agree to this service agreement and scope."
const PERMISSION_ACCEPTANCE = "I authorise ProfileRelaunch to carry out the agreed case-management work described in this permission. This is not payment, Google Manager access, or permission to submit."

type Quote = {
  versionId: string
  versionNumber: number
  serviceCode: string
  serviceName: string
  paymentModel: string
  scope: string
  exclusions: string
  successDefinition: string
  standardAmountMinor: number
  discountPolicyId: string
  discountBps: number
  discountAmountMinor: number
  discountReason?: string | null
  quotedSubtotalMinor: number
  taxBehaviour: string
  taxRateBps: number | null
  taxAmountMinor: number
  taxCode: string | null
  taxJurisdiction: string | null
  totalAmountMinor: number
  currency: string
  validUntil: string
  paymentTiming: string
  termsReference: string
}

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
  quote?: Quote | null
}

function formatGbp(minor: number): string {
  const absolute = Math.abs(minor)
  return `${minor < 0 ? "-" : ""}£${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

function taxTreatment(quote: Quote): string {
  if (quote.taxBehaviour === "UNCONFIRMED") return "Tax treatment is unconfirmed. This quote cannot be accepted until tax is configured."
  if (quote.taxBehaviour === "NOT_APPLICABLE") return "Tax is recorded as not applicable on this quote version."
  if (quote.taxBehaviour === "INCLUSIVE") return `Tax is included in the quoted total${quote.taxRateBps !== null ? ` at ${quote.taxRateBps} basis points` : ""}.`
  return `Tax is added on top of the quoted subtotal${quote.taxRateBps !== null ? ` at ${quote.taxRateBps} basis points` : ""}.`
}

export function ActionClient({ actionId }: { actionId: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<"start" | "otp" | "review" | "done" | "unavailable">("start")
  const [otpSent, setOtpSent] = useState(false)
  const [resendReady, setResendReady] = useState(false)
  const [message, setMessage] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const exchanged = useRef(false)
  const resendTimer = useRef<number | null>(null)
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
  useEffect(() => () => { if (resendTimer.current) window.clearTimeout(resendTimer.current) }, [])

  function armResendWindow() {
    setResendReady(false)
    if (resendTimer.current) window.clearTimeout(resendTimer.current)
    resendTimer.current = window.setTimeout(() => setResendReady(true), 60_000)
  }

  async function sendOtp(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    const response = await fetch("/api/action/otp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    const result = await response.json() as { message?: string; maskedEmail?: string }
    if (!response.ok) {
      if (response.status === 429) { setMessage(result.message || ACTION_UNAVAILABLE); return }
      setPhase("unavailable")
      return
    }
    const nextMasked = result.maskedEmail || maskedEmail
    setMaskedEmail(nextMasked)
    setOtpSent(true)
    setMessage("")
    armResendWindow()
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    const code = new FormData(event.currentTarget).get("code")
    const response = await fetch("/api/action/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
    const result = await response.json() as { message?: string; session?: Session }
    if (!response.ok || !result.session) { setPhase("unavailable"); return }
    if (result.session.kind === "CASE_ACCESS" || result.session.kind === "COMMUNICATION_ACCESS") {
      router.push("/case")
      return
    }
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
    {!otpSent && <>
      <p>A one-time code will be sent to {maskedEmail || "the verified email for this action"}.</p>
      <form onSubmit={sendOtp}><button type="submit">Send code</button></form>
    </>}
    {otpSent && <>
      <p>We sent a six-digit code to {maskedEmail}.</p>
      <form onSubmit={verify}>
        <label>Six-digit code<input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" /></label>
        <button type="submit">Verify code</button>
      </form>
      {resendReady && <form onSubmit={sendOtp}><button type="submit">Resend code</button></form>}
    </>}
    <p role="status">{message}</p>
  </section>
  if (phase === "done") return <section><h1>Secure action</h1><p>{message}</p></section>
  const agreement = session?.agreement
  const quote = session?.quote
  const permission = agreement?.kind === "CASE_MANAGEMENT_PERMISSION"
  if (session?.kind === "QUOTE_ACCEPTANCE" && quote) {
    const canAccept = quote.taxBehaviour !== "UNCONFIRMED"
    return <section>
      <h1>Review this quote</h1>
      <p>{session.caseReference} · {session.businessName}{session.locationName ? ` · ${session.locationName}` : ""}</p>
      <h2>{quote.serviceName}</h2>
      <p>Version {quote.versionNumber}. Valid until {new Date(quote.validUntil).toLocaleString("en-GB", { timeZone: "Europe/London" })}.</p>
      <h2>Scope</h2>
      <p className="preserve-lines">{quote.scope}</p>
      <h2>Exclusions</h2>
      <p className="preserve-lines">{quote.exclusions}</p>
      <h2>Success definition</h2>
      <p className="preserve-lines">{quote.successDefinition}</p>
      <h2>Price</h2>
      <p>Standard {formatGbp(quote.standardAmountMinor)}</p>
      {quote.discountAmountMinor > 0
        ? <p>Discount {formatGbp(quote.discountAmountMinor)} ({quote.discountPolicyId}: {quote.discountReason}). Final {formatGbp(quote.totalAmountMinor)}.</p>
        : <p>No discount. Final {formatGbp(quote.totalAmountMinor)}.</p>}
      <h2>Tax treatment</h2>
      <p>{taxTreatment(quote)}</p>
      <p>Tax amount {formatGbp(quote.taxAmountMinor)}. Total {formatGbp(quote.totalAmountMinor)} {quote.currency}.</p>
      <h2>Payment timing</h2>
      <p>{quote.paymentTiming}</p>
      <p>{quote.termsReference}</p>
      {quote.serviceCode === "RELAUNCH_GUARD" && <p>Accepting this quote does not start monitoring.</p>}
      {quote.paymentModel === "SUCCESS_FEE" && <p>Accepting this quote does not create an invoice or outstanding debt.</p>}
      <div className="button-row">
        {canAccept ? <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void decide("accept", { accepted: form.get("accepted") === "true" }) }}>
          <label className="checkbox"><input type="checkbox" name="accepted" value="true" required />I accept this exact quote version. This is not payment authorisation and does not charge a card.</label>
          <button type="submit">Accept quote</button>
        </form> : <p>This quote cannot be accepted while tax treatment is unconfirmed.</p>}
        <form onSubmit={event => { event.preventDefault(); void decide("decline", {}) }}><button type="submit">Decline</button></form>
      </div>
      <p role="status">{message}</p>
    </section>
  }
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
