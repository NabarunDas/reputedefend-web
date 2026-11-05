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

const week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

function blankDays() {
  return week.map(day => ({ day, closed: true, opens: "", closes: "", breaks: "" }))
}

function ConfirmPreferences({ item }: { item: SetupQueueItem }) {
  const router = useRouter()
  const key = useRef("")
  const progress = item.preferenceProgress
  const ready = item.operationalStatus === "setup_started"
    && item.subscriptionId !== null
    && item.subscriptionVersion !== null
    && item.customerId !== null
    && item.onboardingRequestId !== null
    && item.onboardingVersion !== null
    && progress !== null
    && progress.locationCount > 0
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState(progress?.locations.find(location => !location.confirmed)?.locationId ?? progress?.locations[0]?.locationId ?? "")
  const [days, setDays] = useState(blankDays)
  const [timezone, setTimezone] = useState("Europe/London")
  const [exceptionalHours, setExceptionalHours] = useState("")
  const [outOfHours, setOutOfHours] = useState("")
  const [greeting, setGreeting] = useState("")
  const [enquiryDetails, setEnquiryDetails] = useState("")
  const [callbackInstructions, setCallbackInstructions] = useState("")
  const [callbackWindows, setCallbackWindows] = useState("")
  const [urgentRules, setUrgentRules] = useState("")
  const [directContactRules, setDirectContactRules] = useState("")
  const [specialInstructions, setSpecialInstructions] = useState("")
  const [voicePresentation, setVoicePresentation] = useState<"female" | "male" | "no_preference">("no_preference")
  const [accent, setAccent] = useState("")
  const [spokenLanguage, setSpokenLanguage] = useState("en-GB")
  const [additionalLanguages, setAdditionalLanguages] = useState("")
  const [pronunciationNotes, setPronunciationNotes] = useState("")
  const [source, setSource] = useState<"telephone" | "recorded_email" | "recorded_message">("telephone")
  const [evidenceId, setEvidenceId] = useState("")
  const [attestation, setAttestation] = useState("")
  const [confirmedAt, setConfirmedAt] = useState("")
  const [review, setReview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  if (!ready || !progress) return null
  const selected = progress.locations.find(location => location.locationId === locationId) ?? progress.locations[0]
  const remaining = progress.locations.filter(location => !location.confirmed).map(location => location.locationName)

  function openingHours() {
    return days.map(day => {
      const breaks = day.breaks.split(",").map(item => item.trim()).filter(Boolean).map(item => {
        const [starts, ends] = item.split("-")
        return { starts, ends }
      })
      if (day.closed) return { day: day.day, closed: true, opens: null, closes: null, breaks: [] }
      return { day: day.day, closed: false, opens: day.opens, closes: day.closes, breaks }
    })
  }

  function windows() {
    return callbackWindows.split(";").map(item => item.trim()).filter(Boolean).map(item => {
      const [day, starts, ends] = item.split(/\s+/)
      return { day, starts, ends }
    })
  }

  async function submit() {
    if (!confirmed || pending || !selected || item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return
    if (!key.current) key.current = crypto.randomUUID()
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/confirm-preferences", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          subscriptionId: item.subscriptionId,
          version: item.subscriptionVersion,
          customerId: item.customerId,
          businessId: item.businessId,
          onboardingRequestId: item.onboardingRequestId,
          onboardingVersion: item.onboardingVersion,
          locationId: selected.locationId,
          preferenceVersion: selected.version,
          preferences: {
            timezone: timezone.trim(),
            openingHours: openingHours(),
            exceptionalHours: exceptionalHours.trim(),
            outOfHours: outOfHours.trim(),
            greeting: greeting.trim(),
            enquiryDetails: enquiryDetails.split(",").map(item => item.trim()).filter(Boolean),
            callbackInstructions: callbackInstructions.trim(),
            callbackWindows: windows(),
            urgentRules: urgentRules.trim(),
            directContactRules: directContactRules.trim(),
            specialInstructions: specialInstructions.trim() || null,
            voicePresentation,
            accent: accent.trim(),
            spokenLanguage: spokenLanguage.trim(),
            additionalLanguages: additionalLanguages.split(",").map(item => item.trim()).filter(Boolean),
            pronunciationNotes: pronunciationNotes.trim() || null,
          },
          confirmation: {
            source,
            communicationId: source === "recorded_email" ? evidenceId.trim() : null,
            messageId: source === "recorded_message" ? evidenceId.trim() : null,
            attestation: source === "telephone" ? attestation.trim() : null,
            customerConfirmedAt: new Date(confirmedAt).toISOString(),
          },
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      const text = body?.message ?? "We couldn’t record the preferences. Reload the queue before trying again."
      setMessage(text)
      setTone(response.ok ? "success" : "warning")
      if (response.ok) {
        setOpen(false)
        setReview(false)
        router.refresh()
      }
    } catch {
      setMessage("We couldn’t record the preferences. Reload the queue before trying again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  return <div>
    <p>Business preferences: {progress.confirmedCount} of {progress.locationCount} {progress.locationCount === 1 ? "location" : "locations"} confirmed{remaining.length > 0 ? `. Still needed: ${remaining.join(", ")}.` : "."}</p>
    <button type="button" onClick={() => { key.current = crypto.randomUUID(); setConfirmed(false); setReview(false); setOpen(true) }}>
      {selected.confirmed ? "Record a corrected confirmation" : "Confirm business preferences"}
    </button>
    {open ? <section aria-label={`Confirm business preferences for ${item.reference}`}>
      <h3>{selected.confirmed ? "Correct a recorded confirmation" : "Confirm business preferences"}</h3>
      <p>This records what the customer has confirmed for one location. It does not configure or activate the receptionist.</p>
      <p>Location: {selected.locationName}. {selected.confirmed ? `This replaces nothing silently. It records version ${selected.version + 1} and keeps version ${selected.version}.` : "This is the first confirmed record for this location."}</p>
      <label>Location
        <select value={selected.locationId} onChange={event => { setLocationId(event.target.value); setReview(false) }}>
          {progress.locations.map(location => <option key={location.locationId} value={location.locationId}>{location.locationName}{location.confirmed ? " (confirmed)" : ""}</option>)}
        </select>
      </label>
      <h4>Business hours</h4>
      <label>Timezone <input value={timezone} onChange={event => setTimezone(event.target.value)} /></label>
      {days.map((day, index) => <p key={day.day}>
        <label><input type="checkbox" checked={day.closed} onChange={event => setDays(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, closed: event.target.checked } : item))} /> {day.day} closed</label>
        {day.closed ? null : <>
          <label> Opens <input value={day.opens} placeholder="09:00" onChange={event => setDays(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, opens: event.target.value } : item))} /></label>
          <label> Closes <input value={day.closes} placeholder="17:00" onChange={event => setDays(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, closes: event.target.value } : item))} /></label>
          <label> Breaks <input value={day.breaks} placeholder="12:00-12:30" onChange={event => setDays(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, breaks: event.target.value } : item))} /></label>
        </>}
      </p>)}
      <label>Exceptional hours <input value={exceptionalHours} onChange={event => setExceptionalHours(event.target.value)} /></label>
      <label>Out of hours <textarea value={outOfHours} onChange={event => setOutOfHours(event.target.value)} /></label>
      <h4>Call handling</h4>
      <label>Greeting <textarea value={greeting} onChange={event => setGreeting(event.target.value)} /></label>
      <label>Enquiry details <input value={enquiryDetails} placeholder="Caller name, Callback number" onChange={event => setEnquiryDetails(event.target.value)} /></label>
      <label>Urgent calls <textarea value={urgentRules} onChange={event => setUrgentRules(event.target.value)} /></label>
      <label>When to contact the business <textarea value={directContactRules} onChange={event => setDirectContactRules(event.target.value)} /></label>
      <label>Special instructions <textarea value={specialInstructions} onChange={event => setSpecialInstructions(event.target.value)} /></label>
      <h4>Callback instructions</h4>
      <label>Instructions <textarea value={callbackInstructions} onChange={event => setCallbackInstructions(event.target.value)} /></label>
      <label>Windows <input value={callbackWindows} placeholder="monday 10:00 12:00" onChange={event => setCallbackWindows(event.target.value)} /></label>
      <h4>Language and voice</h4>
      <label>Spoken language <input value={spokenLanguage} onChange={event => setSpokenLanguage(event.target.value)} /></label>
      <label>Additional languages <input value={additionalLanguages} onChange={event => setAdditionalLanguages(event.target.value)} /></label>
      <label>Voice presentation
        <select value={voicePresentation} onChange={event => setVoicePresentation(event.target.value as "female" | "male" | "no_preference")}>
          <option value="no_preference">No preference</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
        </select>
      </label>
      <label>Accent <input value={accent} onChange={event => setAccent(event.target.value)} /></label>
      <label>Pronunciation notes <textarea value={pronunciationNotes} onChange={event => setPronunciationNotes(event.target.value)} /></label>
      <h4>Customer confirmation</h4>
      <label>Source
        <select value={source} onChange={event => setSource(event.target.value as "telephone" | "recorded_email" | "recorded_message")}>
          <option value="telephone">Telephone, with staff attestation</option>
          <option value="recorded_email">Recorded customer email</option>
          <option value="recorded_message">Recorded customer message</option>
        </select>
      </label>
      {source === "telephone" ? <label>Attestation <textarea value={attestation} onChange={event => setAttestation(event.target.value)} /></label> : <label>Evidence reference <input value={evidenceId} onChange={event => setEvidenceId(event.target.value)} /></label>}
      <label>Customer confirmed at <input type="datetime-local" value={confirmedAt} onChange={event => setConfirmedAt(event.target.value)} /></label>
      {review ? <div>
        <h4>Check before recording</h4>
        <dl>
          <dt>Customer</dt><dd>{item.customerName}</dd>
          <dt>Business</dt><dd>{item.businessName}</dd>
          <dt>Subscription</dt><dd>{item.reference}</dd>
          <dt>Location</dt><dd>{selected.locationName}</dd>
          <dt>Timezone</dt><dd>{timezone}</dd>
          <dt>Greeting</dt><dd>{greeting}</dd>
          <dt>Callback</dt><dd>{callbackInstructions}</dd>
          <dt>Language</dt><dd>{spokenLanguage}</dd>
          <dt>Voice</dt><dd>{voicePresentation}</dd>
          <dt>Accent</dt><dd>{accent}</dd>
          <dt>Confirmation</dt><dd>{source === "telephone" ? "Telephone attestation" : source === "recorded_email" ? "Recorded email" : "Recorded message"}</dd>
        </dl>
        <label>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {" "}I confirm the customer agreed these preferences for this location.
        </label>
        <p>
          <button type="button" disabled={!confirmed || pending} onClick={() => void submit()}>Confirm business preferences</button>
          {" "}
          <button type="button" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
        </p>
      </div> : <p><button type="button" onClick={() => setReview(true)}>Review confirmation</button></p>}
    </section> : null}
    {message ? <Notice tone={tone} live="status">{message}</Notice> : null}
  </div>
}

export function SetupQueueView({ items, beginSetupEnabled = false, confirmPreferencesEnabled = false }: { items: readonly SetupQueueItem[]; beginSetupEnabled?: boolean; confirmPreferencesEnabled?: boolean }) {
  const later = futureCommands.filter(command => {
    if (beginSetupEnabled && command === "Begin setup") return false
    if (confirmPreferencesEnabled && command === "Confirm business preferences") return false
    return true
  })
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
                  {confirmPreferencesEnabled ? <ConfirmPreferences item={item} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <h2>Later setup commands</h2>
    <p>These actions are not available from this page. A later phase can record each one as its own audited command. None of them runs because a subscription is financially active. Confirm business preferences records the customer’s confirmed hours and service behaviour for each selected location. It does not configure or activate the receptionist.</p>
    <ul>
      {later.map(command => <li key={command}>{command}</li>)}
    </ul>
  </>
}
