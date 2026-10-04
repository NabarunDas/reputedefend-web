"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { guardMoney, guardTaxNote, guardWhen } from "@/lib/portal/guard/model"
import type { GuardAction, GuardLocation, GuardSubscriptionAction } from "@/lib/portal/guard/parse"

function slotKey(keys: { current: Record<string, string> }, slot: string) {
  keys.current[slot] ||= crypto.randomUUID()
  return keys.current[slot]
}

export function GuardUnavailable() {
  return (
    <div className="guard-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load Relaunch Guard</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal">Back to your dashboard</a></p>
    </div>
  )
}

export function GuardView({ locations, focused }: { locations: GuardLocation[]; focused: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [agreed, setAgreed] = useState<string | null>(null)
  const keys = useRef<Record<string, string>>({})

  async function submit(location: GuardLocation, action: GuardAction, operation: string, confirmation: Record<string, unknown>) {
    const slot = `${location.selector}:${action.selector}:${operation}`
    setBusy(slot)
    setNotice(null)
    const response = await fetch("/api/portal/guard", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": slotKey(keys, slot) },
      body: JSON.stringify({ selector: location.selector, actionSelector: action.selector, operation, confirmation }),
    })
    const body = await response.json().catch(() => null) as { message?: string; checkoutUrl?: string; status?: string } | null
    setBusy(null)
    if (body?.checkoutUrl && body.checkoutUrl.startsWith("https://")) {
      window.location.assign(body.checkoutUrl)
      return
    }
    if (response.ok) {
      delete keys.current[slot]
      setNotice(body?.message || "Your response is recorded.")
      router.refresh()
      return
    }
    setNotice(body?.message || "We couldn't complete that step. Please try again shortly.")
  }

  return (
    <div className="guard-page">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>{focused ? "Relaunch Guard location" : "Relaunch Guard"}</h1>
      <p>Guard is monitored according to the active service arrangement. This page does not start monitoring or create a charge.</p>
      {notice ? <p className="guard-notice" role="alert">{notice}</p> : null}
      {locations.length === 0 ? <p>You do not have Relaunch Guard for a location yet.</p> : null}
      <ul className="guard-list">
        {locations.map(location => (
          <li key={location.selector} className="guard-location">
            <h2>{location.businessName}</h2>
            <p>{location.locationName}</p>
            <p>{location.status}</p>
            <p>{location.arrangement}</p>
            <p>{location.permission}</p>
            <p>{location.monitoringActive ? "Monitoring is active." : "Monitoring is not active."}</p>
            {location.actions.length > 0 ? <p>Your response is needed.</p> : null}
            {!focused ? <p><a href={`/portal/guard/${location.selector}`}>Open this location</a></p> : null}
            {focused ? <GuardDetail location={location} busy={busy} agreed={agreed} setAgreed={setAgreed} submit={submit} /> : null}
          </li>
        ))}
      </ul>
      {focused ? <p className="case-back"><a href="/portal/guard">All Guard locations</a></p> : null}
    </div>
  )
}

function GuardDetail({
  location, busy, agreed, setAgreed, submit,
}: {
  location: GuardLocation
  busy: string | null
  agreed: string | null
  setAgreed: (value: string | null) => void
  submit: (location: GuardLocation, action: GuardAction, operation: string, confirmation: Record<string, unknown>) => Promise<void>
}) {
  return (
    <div className="guard-detail">
      {location.activatedAt ? <p>Activated {guardWhen(location.activatedAt)}</p> : null}
      {location.includedEndsAt ? <p>Included Guard ends {guardWhen(location.includedEndsAt)}</p> : null}
      <h3>Monitoring</h3>
      {location.lastCheckedAt ? <p>Last checked {guardWhen(location.lastCheckedAt)}</p> : <p>No completed check is recorded yet.</p>}
      {location.profileAvailable === true ? <p>The profile appeared available.</p> : null}
      {location.profileAvailable === false ? <p>The profile did not appear available.</p> : null}
      {location.monitoring ? <p>{location.monitoring}</p> : null}
      {location.issueUnderReview ? <p>ProfileRelaunch is reviewing a detected issue.</p> : null}
      <h3>Plan and billing</h3>
      <p>{location.billing}</p>
      {location.subscription ? <p>{location.subscription}</p> : null}
      {location.amountMinor !== null && location.currency ? <p>Recurring amount {guardMoney(location.amountMinor, location.currency)}</p> : null}
      {location.taxBehaviour ? <p>{guardTaxNote(location.taxBehaviour)}</p> : null}
      {location.periodEnd ? <p>Current period ends {guardWhen(location.periodEnd)}</p> : null}
      {location.cancellation ? <p>{location.cancellation}</p> : null}
      {location.actions.map(action => (
        <GuardActionForm key={action.selector} location={location} action={action} busy={busy} agreed={agreed} setAgreed={setAgreed} submit={submit} />
      ))}
    </div>
  )
}

function GuardActionForm({
  location, action, busy, agreed, setAgreed, submit,
}: {
  location: GuardLocation
  action: GuardAction
  busy: string | null
  agreed: string | null
  setAgreed: (value: string | null) => void
  submit: (location: GuardLocation, action: GuardAction, operation: string, confirmation: Record<string, unknown>) => Promise<void>
}) {
  const locked = busy !== null
  if (action.kind === "permission") {
    const slot = `${action.selector}:permission`
    return (
      <div className="guard-action">
        <h3>Permission</h3>
        <p className="preserve-lines">{action.permissionText}</p>
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "accept_permission", { accepted: true, permissionVersion: action.permissionVersion }) }}>
          <label className="checkbox">
            <input type="checkbox" checked={agreed === slot} onChange={event => setAgreed(event.target.checked ? slot : null)} />
            {action.permissionText}
          </label>
          <button type="submit" disabled={locked || agreed !== slot}>Accept Guard permission</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "decline_permission", {}) }}>
          <button type="submit" disabled={locked}>Decline</button>
        </form>
      </div>
    )
  }
  if (action.kind === "price_change") {
    const slot = `${action.selector}:price`
    return (
      <div className="guard-action">
        <h3>Price change</h3>
        <p>Current amount {guardMoney(action.oldAmountMinor, action.currency)}. Proposed amount {guardMoney(action.newAmountMinor, action.currency)}.</p>
        {action.effectiveAt ? <p>If accepted, the new price applies at the next renewal on {guardWhen(action.effectiveAt)}.</p> : null}
        <p className="preserve-lines">{action.noticeText}</p>
        <p>No response is not acceptance.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "accept_price", { accepted: true }) }}>
          <label className="checkbox">
            <input type="checkbox" checked={agreed === slot} onChange={event => setAgreed(event.target.checked ? slot : null)} />
            I accept this exact future price for this location only.
          </label>
          <button type="submit" disabled={locked || agreed !== slot}>Accept price change</button>
        </form>
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "decline_price", {}) }}>
          <button type="submit" disabled={locked}>Decline</button>
        </form>
      </div>
    )
  }
  return <SubscriptionAction location={location} action={action} busy={busy} agreed={agreed} setAgreed={setAgreed} submit={submit} />
}

function SubscriptionAction({
  location, action, busy, agreed, setAgreed, submit,
}: {
  location: GuardLocation
  action: GuardSubscriptionAction
  busy: string | null
  agreed: string | null
  setAgreed: (value: string | null) => void
  submit: (location: GuardLocation, action: GuardAction, operation: string, confirmation: Record<string, unknown>) => Promise<void>
}) {
  const locked = busy !== null
  const slot = `${action.selector}:consent`
  return (
    <div className="guard-action">
      <h3>Monthly billing</h3>
      <p>Accepted monthly amount {guardMoney(action.amountMinor, action.currency)} for this location only.</p>
      {action.taxBehaviour ? <p>{guardTaxNote(action.taxBehaviour)}</p> : null}
      <p className="preserve-lines">{action.cancellationTerms}</p>
      {!action.consentRecorded ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "accept_consent", { accepted: true, consentVersion: action.consentVersion }) }}>
          <label className="checkbox">
            <input type="checkbox" checked={agreed === slot} onChange={event => setAgreed(event.target.checked ? slot : null)} />
            {action.consentText}
          </label>
          <button type="submit" disabled={locked || agreed !== slot}>Accept monthly billing for this location</button>
        </form>
      ) : <p>Consent is recorded. No fee is due from this page.</p>}
      {action.checkout ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "start_checkout", {}) }}>
          <button type="submit" disabled={locked}>Continue to secure Stripe Checkout</button>
        </form>
      ) : null}
      {action.recovery ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "start_recovery", {}) }}>
          <button type="submit" disabled={locked}>Update the payment method securely</button>
        </form>
      ) : null}
      {action.periodEndCancellation ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "request_period_end_cancellation", {}) }}>
          <button type="submit" disabled={locked}>Cancel at period end</button>
        </form>
      ) : null}
      {action.undoPeriodEndCancellation ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "undo_period_end_cancellation", {}) }}>
          <button type="submit" disabled={locked}>Keep this location subscription</button>
        </form>
      ) : null}
      {action.immediateCancellationReview ? (
        <form onSubmit={event => { event.preventDefault(); void submit(location, action, "request_immediate_cancellation", {}) }}>
          <button type="submit" disabled={locked}>Request immediate cancellation review</button>
        </form>
      ) : null}
      <p>Returning from Stripe does not start Guard billing. A confirmed invoice payment is required.</p>
    </div>
  )
}
