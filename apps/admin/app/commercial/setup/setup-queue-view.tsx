"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ukDate } from "@/lib/admin/activity"
import type { SetupQueueItem } from "@/lib/commercial/setup-queue"
import { Badge, EmptyState, Notice } from "../../ui"

const futureCommands = [
  "Begin setup",
  "Confirm business preferences",
  "Confirm AI configuration",
  "Record provider and number allocation",
  "Record successful test call",
  "Request customer forwarding confirmation",
  "Approve activation",
] as const

const confirmReason = "Begin setup after the verified payment."

function money(minor: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100)
}

function operationalLabel(status: SetupQueueItem["operationalStatus"]): string {
  if (status === "not_started") return "Setup not started"
  if (status === "setup_started") return "Setup in progress"
  return "Awaiting final verification"
}

function BeginSetup({ item }: { item: SetupQueueItem }) {
  const router = useRouter()
  const key = useRef("")
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const ready = item.operationalStatus === "not_started"
    && item.nextAction === "Begin setup"
    && item.subscriptionId !== null
    && item.subscriptionVersion !== null
    && item.customerId !== null
    && item.onboardingRequestId !== null
    && item.onboardingVersion !== null

  if (!ready) return null

  async function start() {
    if (!confirmed || pending || item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return
    if (!key.current) key.current = crypto.randomUUID()
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/begin-setup", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          subscriptionId: item.subscriptionId,
          version: item.subscriptionVersion,
          customerId: item.customerId,
          businessId: item.businessId,
          onboardingRequestId: item.onboardingRequestId,
          onboardingVersion: item.onboardingVersion,
          reason: confirmReason,
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      const text = body?.message ?? "We couldn’t start setup. Reload the queue before trying again."
      setMessage(text)
      setTone(response.ok ? "success" : "warning")
      if (response.ok) {
        setOpen(false)
        router.refresh()
      }
    } catch {
      setMessage("We couldn’t start setup. Reload the queue before trying again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  return <div>
    <button type="button" onClick={() => { key.current = crypto.randomUUID(); setConfirmed(false); setOpen(true) }}>Begin setup</button>
    {open ? <section aria-label={`Confirm setup for ${item.reference}`}>
      <h3>Confirm begin setup</h3>
      <p>This starts service setup. It does not activate the receptionist, allocate a number, or start Guard monitoring.</p>
      <dl>
        <dt>Customer</dt><dd>{item.customerName}</dd>
        <dt>Business</dt><dd>{item.businessName}</dd>
        <dt>Commercial reference</dt><dd>{item.reference}</dd>
        <dt>Plan</dt><dd>{item.plan} · {money(item.monthlyPriceMinor)} a month</dd>
        <dt>Selected locations</dt><dd>{item.locations.map(location => location.locationName).join(", ")}</dd>
        <dt>Verified initial payment</dt><dd>{money(item.monthlyPriceMinor)} · {ukDate(item.paymentConfirmedAt)}</dd>
        <dt>Current operational status</dt><dd>{operationalLabel(item.operationalStatus)}</dd>
      </dl>
      <label>
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        {" "}I confirm setup should start for this paid subscription.
      </label>
      <p>
        <button type="button" disabled={!confirmed || pending} onClick={() => void start()}>Confirm and begin setup</button>
        {" "}
        <button type="button" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
      </p>
    </section> : null}
    {message ? <Notice tone={tone} live="status">{message}</Notice> : null}
  </div>
}

export function SetupQueueView({ items, beginSetupEnabled = false }: { items: readonly SetupQueueItem[]; beginSetupEnabled?: boolean }) {
  const later = futureCommands.filter(command => !(beginSetupEnabled && command === "Begin setup"))
  return <>
    {items.length === 0 ? <EmptyState>No paid Telloya or Complete subscription is waiting for setup.</EmptyState> : (
      <div className="table-scroll" role="region" aria-label="Paid subscriptions awaiting setup" tabIndex={0}>
        <table>
          <caption>Paid subscriptions whose service is not active. Payment is taken from stored evidence.</caption>
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Subscription</th>
              <th scope="col">Locations</th>
              <th scope="col">Payment</th>
              <th scope="col">Setup</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.reference}>
                <td>
                  <span>{item.customerName}</span><br />
                  <span>{item.businessName}</span>
                </td>
                <td>
                  <Badge tone="info">{item.product}</Badge><br />
                  {item.reference}<br />
                  <span className="muted">{item.plan} · {money(item.monthlyPriceMinor)} a month</span>
                </td>
                <td>
                  {item.locations.length === 0 ? "No location selected" : item.locations.map(location => location.locationName).join(", ")}
                  {item.guard.included ? (
                    <>
                      <br />
                      <span className="muted">
                        Guard locations included: {item.guard.quantity}. Monitoring has not started.
                        {item.guard.assignment === "pending_confirmation"
                          ? " Location assignment is pending confirmation."
                          : ` Assigned: ${item.guard.locations.map(location => location.locationName).join(", ")}.`}
                      </span>
                    </>
                  ) : null}
                </td>
                <td>
                  <Badge tone="success">Verified initial settlement</Badge><br />
                  <span className="muted">{ukDate(item.paymentConfirmedAt)}</span><br />
                  <span className="muted">{ukDate(item.periodStart)} to {ukDate(item.periodEnd)}. A later period is not shown as paid.</span>
                </td>
                <td>
                  {operationalLabel(item.operationalStatus)}<br />
                  {item.customerDisplay}<br />
                  <span className="muted">Next action: {item.nextAction}</span>
                  {item.setupStartedAt ? <><br /><span className="muted">Started {ukDate(item.setupStartedAt)} UK</span></> : null}
                  {beginSetupEnabled ? <BeginSetup item={item} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <h2>Later setup commands</h2>
    <p>These actions are not available from this page. A later phase can record each one as its own audited command. None of them runs because a subscription is financially active. Confirm business preferences is the next command after setup starts, and it stores the customer’s confirmed hours and service behaviour rather than inventing them.</p>
    <ul>
      {later.map(command => <li key={command}>{command}</li>)}
    </ul>
  </>
}
