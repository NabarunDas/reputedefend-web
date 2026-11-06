"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ukDate } from "@/lib/admin/activity"
import type { AgentTestLocationProgress, AllocationLocationProgress, ConfigurationLocationProgress, ForwardingLocationProgress, SetupQueueItem } from "@/lib/commercial/setup-queue"
import { startControlledReceptionistCall } from "@/lib/commercial/controlled-web-call"
import { Badge, EmptyState, Notice } from "../../ui"

const futureCommands = [
  "Begin setup",
  "Confirm business preferences",
  "Confirm AI configuration",
  "Record provider and number allocation",
  "Record forwarding instructions",
  "Start controlled receptionist test",
  "Verify AI receptionist test call",
  "Confirm readiness for the final telephone connection",
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

const dayLabels: Record<(typeof week)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

function isUuidKey(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function confirmationTimeError(value: string): string | null {
  if (!value.trim()) return "Enter the date and time the customer confirmed these preferences."
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Enter a valid confirmation date and time."
  if (parsed.getTime() > Date.now()) return "The confirmation time cannot be in the future."
  if (parsed.getTime() < Date.now() - 400 * 24 * 60 * 60 * 1000) return "The confirmation time is older than the records we can accept."
  return null
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
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [dateError, setDateError] = useState<string | null>(null)
  const [attestationError, setAttestationError] = useState<string | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const selected = progress?.locations.find(location => location.locationId === locationId) ?? progress?.locations[0]
  const payloadText = selected ? JSON.stringify(preferencePayload(selected.locationId, selected.version)) : ""
  const reviewFresh = review && reviewed !== null && reviewed === payloadText
  if (!ready || !progress || !selected) return null
  const chosen = selected
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

  function preferencePayload(location: string, version: number) {
    const parsed = new Date(confirmedAt)
    return {
      locationId: location,
      preferenceVersion: version,
      preferences: {
        timezone: timezone.trim(),
        openingHours: openingHours(),
        exceptionalHours: exceptionalHours.trim(),
        outOfHours: outOfHours.trim(),
        greeting: greeting.trim(),
        enquiryDetails: enquiryDetails.split(",").map(detail => detail.trim()).filter(Boolean),
        callbackInstructions: callbackInstructions.trim(),
        callbackWindows: windows(),
        urgentRules: urgentRules.trim(),
        directContactRules: directContactRules.trim(),
        specialInstructions: specialInstructions.trim() || null,
        voicePresentation,
        accent: accent.trim(),
        spokenLanguage: spokenLanguage.trim(),
        additionalLanguages: additionalLanguages.split(",").map(language => language.trim()).filter(Boolean),
        pronunciationNotes: pronunciationNotes.trim() || null,
      },
      confirmation: {
        source,
        communicationId: source === "recorded_email" ? evidenceId.trim() : null,
        messageId: source === "recorded_message" ? evidenceId.trim() : null,
        attestation: attestation.trim(),
        customerConfirmedAt: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      },
    }
  }

  function hoursSummary() {
    return days.map(day => {
      const label = dayLabels[day.day]
      if (day.closed) return `${label} closed`
      const breaks = day.breaks.trim() ? ` (break ${day.breaks.trim()})` : ""
      return `${label} ${day.opens || "not set"}–${day.closes || "not set"}${breaks}`
    }).join("; ")
  }

  function beginReview() {
    const dateProblem = confirmationTimeError(confirmedAt)
    const trimmedAttestation = attestation.trim()
    const attestationProblem = trimmedAttestation.length < 20 || trimmedAttestation.length > 500
      ? "Write a staff attestation of 20 to 500 characters confirming these preferences for this location."
      : null
    const evidenceProblem = source !== "telephone" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evidenceId.trim())
      ? "Enter the recorded email or message reference for this customer and location."
      : null
    setDateError(dateProblem)
    setAttestationError(attestationProblem)
    setEvidenceError(evidenceProblem)
    if (dateProblem || attestationProblem || evidenceProblem) return
    key.current = crypto.randomUUID()
    setReviewed(JSON.stringify(preferencePayload(chosen.locationId, chosen.version)))
    setConfirmed(false)
    setReview(true)
  }

  function leaveReview() {
    setReview(false)
    setConfirmed(false)
    setReviewed(null)
    key.current = ""
  }

  async function submit() {
    const current = preferencePayload(chosen.locationId, chosen.version)
    if (!confirmed || pending || reviewed === null || reviewed !== JSON.stringify(current) || !isUuidKey(key.current)) return
    if (item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return
    const recorded = JSON.parse(reviewed) as ReturnType<typeof preferencePayload>
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
          ...recorded,
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      const text = body?.message ?? "We couldn’t record the preferences. Reload the queue before trying again."
      setMessage(text)
      setTone(response.ok ? "success" : "warning")
      if (response.ok) {
        setOpen(false)
        setReview(false)
        setReviewed(null)
        key.current = ""
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
    <button type="button" onClick={() => { leaveReview(); setOpen(true) }}>
      {selected.confirmed ? "Record a corrected confirmation" : "Confirm business preferences"}
    </button>
    {open ? <section aria-label={`Confirm business preferences for ${item.reference}`}>
      <h3>{selected.confirmed ? "Correct a recorded confirmation" : "Confirm business preferences"}</h3>
      <p>This records what the customer has confirmed for one location. It does not configure or activate the receptionist.</p>
      <p>Location: {selected.locationName}. {selected.confirmed ? `This replaces nothing silently. It records version ${selected.version + 1} and keeps version ${selected.version}.` : "This is the first confirmed record for this location."}</p>
      <label>Location
        <select value={selected.locationId} onChange={event => { setLocationId(event.target.value); leaveReview() }}>
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
      <label>Staff attestation <textarea value={attestation} onChange={event => { setAttestation(event.target.value); setAttestationError(null) }} /></label>
      {attestationError ? <p role="alert">{attestationError}</p> : null}
      {source === "telephone" ? null : <label>Evidence reference <input value={evidenceId} onChange={event => { setEvidenceId(event.target.value); setEvidenceError(null) }} /></label>}
      {evidenceError ? <p role="alert">{evidenceError}</p> : null}
      <label>Customer confirmed at <input type="datetime-local" aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? "preference-confirmed-at-error" : undefined} value={confirmedAt} onChange={event => { setConfirmedAt(event.target.value); setDateError(null) }} /></label>
      {dateError ? <p id="preference-confirmed-at-error" role="alert">{dateError}</p> : null}
      {reviewFresh ? <div>
        <h4>Check before recording</h4>
        <dl>
          <dt>Customer</dt><dd>{item.customerName}</dd>
          <dt>Business</dt><dd>{item.businessName}</dd>
          <dt>Subscription</dt><dd>{item.reference}</dd>
          <dt>Location</dt><dd>{selected.locationName}</dd>
          <dt>Timezone</dt><dd>{timezone}</dd>
          <dt>Opening hours</dt><dd>{hoursSummary()}</dd>
          <dt>Exceptional hours</dt><dd>{exceptionalHours.trim() || "None"}</dd>
          <dt>Out of hours</dt><dd>{outOfHours.trim() || "None"}</dd>
          <dt>Greeting</dt><dd>{greeting.trim() || "None"}</dd>
          <dt>Information to capture</dt><dd>{enquiryDetails.trim() || "None"}</dd>
          <dt>Callback instructions</dt><dd>{callbackInstructions.trim() || "None"}</dd>
          <dt>Callback windows</dt><dd>{callbackWindows.trim() || "None"}</dd>
          <dt>Urgent calls</dt><dd>{urgentRules.trim() || "None"}</dd>
          <dt>Direct contact</dt><dd>{directContactRules.trim() || "None"}</dd>
          <dt>Special instructions</dt><dd>{specialInstructions.trim() || "None"}</dd>
          <dt>Spoken language</dt><dd>{spokenLanguage.trim() || "None"}</dd>
          <dt>Additional languages</dt><dd>{additionalLanguages.trim() || "None"}</dd>
          <dt>Voice presentation</dt><dd>{voicePresentation === "female" ? "Female" : voicePresentation === "male" ? "Male" : "No preference"}</dd>
          <dt>Accent</dt><dd>{accent.trim() || "None"}</dd>
          <dt>Pronunciation notes</dt><dd>{pronunciationNotes.trim() || "None"}</dd>
          <dt>Confirmation source</dt><dd>{source === "telephone" ? "Telephone" : source === "recorded_email" ? "Recorded customer email" : "Recorded customer message"}</dd>
          <dt>Evidence reference</dt><dd>{source === "telephone" ? "No email or message reference" : evidenceId.trim()}</dd>
          <dt>Staff attestation</dt><dd>{attestation.trim()}</dd>
          <dt>Confirmation time</dt><dd>{confirmedAt}</dd>
        </dl>
        <label>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {" "}I confirm the customer agreed these displayed preferences for this location.
        </label>
        <p>
          <button type="button" disabled={!confirmed || pending || reviewed !== payloadText} onClick={() => void submit()}>Confirm business preferences</button>
          {" "}
          <button type="button" onClick={() => { leaveReview(); setOpen(false) }} disabled={pending}>Cancel</button>
        </p>
      </div> : <p><button type="button" onClick={beginReview}>Review confirmation</button></p>}
    </section> : null}
    {message ? <Notice tone={tone} live="status">{message}</Notice> : null}
  </div>
}

function configurationStatus(status: ConfigurationLocationProgress["status"]) {
  if (status === "recorded") return "Configuration recorded — test pending"
  if (status === "review") return "Configuration requiring review because preferences changed"
  return "Configuration not yet recorded"
}

function ConfirmAiConfiguration({ item, providerLane }: { item: SetupQueueItem; providerLane: "dev" | "production" | null }) {
  const router = useRouter()
  const key = useRef("")
  const preferences = item.preferenceProgress
  const progress = item.configurationProgress
  const preferencesReady = preferences !== null && preferences.locationCount > 0 && preferences.confirmedCount === preferences.locationCount
  const ready = item.operationalStatus === "setup_started"
    && item.subscriptionId !== null
    && item.subscriptionVersion !== null
    && item.customerId !== null
    && item.onboardingRequestId !== null
    && item.onboardingVersion !== null
    && preferencesReady
    && progress !== null
    && progress.locationCount > 0
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState(progress?.locations.find(location => location.status !== "recorded")?.locationId ?? progress?.locations[0]?.locationId ?? "")
  const [agentRef, setAgentRef] = useState("")
  const [revision, setRevision] = useState("")
  const [chosenVoice, setChosenVoice] = useState("")
  const [chosenLanguage, setChosenLanguage] = useState("")
  const [attestation, setAttestation] = useState("")
  const [review, setReview] = useState(false)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [formError, setFormError] = useState<string | null>(null)
  const selected = progress?.locations.find(location => location.locationId === locationId) ?? progress?.locations[0]
  if (!ready || !progress || !selected) return null
  if (!providerLane) {
    return <p>The provider lane is not configured for this deployment, so an AI configuration cannot be recorded.</p>
  }
  const chosen = selected
  const lane = providerLane
  const payloadText = JSON.stringify(configurationPayload(chosen))
  const reviewFresh = review && reviewed !== null && reviewed === payloadText
  const reviewNames = progress.locations.filter(location => location.status === "review").map(location => location.locationName)

  function configurationPayload(location: ConfigurationLocationProgress) {
    return {
      locationId: location.locationId,
      preferenceVersion: location.preferenceVersion,
      provisionVersion: location.provisionVersion,
      configurationVersion: location.configurationVersion,
      provider: {
        provider: "telloya_voice",
        environment: lane,
        agentRef: agentRef.trim(),
        revision: revision.trim(),
        chosenVoice: chosenVoice.trim(),
        chosenLanguage: chosenLanguage.trim(),
        attestation: attestation.trim(),
        staffConfirmed: true,
      },
    }
  }

  function evidenceError() {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(agentRef.trim())) return "Enter the provider agent reference recorded for this location."
    const trimmedRevision = revision.trim()
    if (!/^rev-[0-9]{4}$/.test(trimmedRevision)) return "Enter the provider revision as rev- followed by exactly four digits, for example rev-0004."
    if (chosenVoice.trim().length < 1 || chosenVoice.trim().length > 80) return "Enter the provider voice identifier that was actually selected. A customer preference is not a provider voice."
    if (chosenLanguage.trim().length < 1 || chosenLanguage.trim().length > 40) return "Enter the provider language identifier that was actually selected."
    const trimmedAttestation = attestation.trim()
    if (trimmedAttestation.length < 20 || trimmedAttestation.length > 500) return "Write a staff attestation of 20 to 500 characters describing how this configuration was checked."
    if (chosen.preferenceVersion < 1) return "Confirm the business preferences for this location before recording the configuration."
    return null
  }

  function beginReview() {
    const problem = evidenceError()
    setFormError(problem)
    if (problem) return
    key.current = crypto.randomUUID()
    setReviewed(JSON.stringify(configurationPayload(chosen)))
    setConfirmed(false)
    setReview(true)
  }

  function leaveReview() {
    setReview(false)
    setConfirmed(false)
    setReviewed(null)
    key.current = ""
  }

  async function submit() {
    const current = configurationPayload(chosen)
    if (!confirmed || pending || reviewed === null || reviewed !== JSON.stringify(current) || !isUuidKey(key.current)) return
    if (item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return
    const recorded = JSON.parse(reviewed) as ReturnType<typeof configurationPayload>
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/confirm-ai-configuration", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          subscriptionId: item.subscriptionId,
          version: item.subscriptionVersion,
          customerId: item.customerId,
          businessId: item.businessId,
          onboardingRequestId: item.onboardingRequestId,
          onboardingVersion: item.onboardingVersion,
          ...recorded,
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      const text = body?.message ?? "We couldn’t record the AI configuration. Reload the queue before trying again."
      setMessage(text)
      setTone(response.ok ? "success" : "warning")
      if (response.ok) {
        setOpen(false)
        setReview(false)
        setReviewed(null)
        key.current = ""
        router.refresh()
      }
    } catch {
      setMessage("We couldn’t record the AI configuration. Reload the queue before trying again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  const action = chosen.status === "recorded"
    ? "Record a corrected configuration"
    : chosen.status === "review"
      ? "Review AI configuration"
      : "Confirm AI configuration"

  return <div>
    <p>AI configuration: {progress.recordedCount} of {progress.locationCount} {progress.locationCount === 1 ? "location" : "locations"} recorded.{reviewNames.length > 0 ? ` Review needed: ${reviewNames.join(", ")}.` : ""}</p>
    <p>{chosen.locationName}: {configurationStatus(chosen.status)}. Preferences confirmed.</p>
    <button type="button" onClick={() => { leaveReview(); setOpen(true) }}>{action}</button>
    {open ? <section aria-label={`Confirm AI configuration for ${item.reference}`}>
      <h3>Confirm AI configuration</h3>
      <p>This records an operator-attested provider configuration for one location. It does not test the receptionist, allocate a number, or make the service live.</p>
      <p>{configurationStatus(chosen.status)}. {chosen.status === "recorded" ? `This records version ${chosen.configurationVersion + 1} and keeps version ${chosen.configurationVersion}.` : "The receptionist cannot answer calls."}</p>
      <label>Location
        <select value={chosen.locationId} onChange={event => { setLocationId(event.target.value); leaveReview() }}>
          {progress.locations.map(location => <option key={location.locationId} value={location.locationId}>{location.locationName} ({configurationStatus(location.status)})</option>)}
        </select>
      </label>
      <h4>Confirmed customer preferences</h4>
      <dl>
        <dt>Business</dt><dd>{item.businessName}</dd>
        <dt>Location</dt><dd>{chosen.locationName}</dd>
        <dt>Timezone</dt><dd>{chosen.timezone ?? "Not recorded"}</dd>
        <dt>Opening hours</dt><dd>{chosen.hoursSummary ?? "Not recorded"}</dd>
        <dt>Exceptional hours</dt><dd>{chosen.exceptionalHours ?? "Not recorded"}</dd>
        <dt>Out of hours</dt><dd>{chosen.outOfHours ?? "Not recorded"}</dd>
        <dt>Greeting</dt><dd>{chosen.greeting ?? "Not recorded"}</dd>
        <dt>Callback instructions</dt><dd>{chosen.callbackInstructions ?? "Not recorded"}</dd>
        <dt>Urgent calls</dt><dd>{chosen.urgentRules ?? "Not recorded"}</dd>
        <dt>Direct contact</dt><dd>{chosen.directContactRules ?? "Not recorded"}</dd>
        <dt>Special instructions</dt><dd>{chosen.specialInstructions ?? "None"}</dd>
        <dt>Spoken language</dt><dd>{chosen.spokenLanguage ?? "Not recorded"}{chosen.additionalLanguages && chosen.additionalLanguages.length > 0 ? ` (also ${chosen.additionalLanguages.join(", ")})` : ""}</dd>
        <dt>Voice preference</dt><dd>{chosen.voicePresentation ?? "Not recorded"}{chosen.accent ? `, ${chosen.accent}` : ""}</dd>
        <dt>Pronunciation notes</dt><dd>{chosen.pronunciationNotes ?? "None"}</dd>
      </dl>
      <h4>Provider evidence</h4>
      <p>Provider lane: {lane === "dev" ? "DEV" : "Production"}. This deployment chooses the lane. The form cannot switch it.</p>
      <p>Record the voice and language identifiers that were actually chosen in the provider environment. A customer preference does not prove the provider supports it.</p>
      <label>Provider agent reference <input value={agentRef} onChange={event => setAgentRef(event.target.value)} /></label>
      <p>Accepted revision form: rev- and exactly four digits, for example rev-0004. That records provider agent version 4. The conversation test compares it with the integer agent version returned for the provider call.</p>
      <label>Configuration revision <input value={revision} onChange={event => setRevision(event.target.value)} /></label>
      <label>Chosen provider voice <input value={chosenVoice} onChange={event => setChosenVoice(event.target.value)} /></label>
      <label>Chosen provider language <input value={chosenLanguage} onChange={event => setChosenLanguage(event.target.value)} /></label>
      <label>Staff attestation <textarea value={attestation} onChange={event => setAttestation(event.target.value)} /></label>
      {formError ? <p role="alert">{formError}</p> : null}
      {reviewFresh ? <div>
        <h4>Check before recording</h4>
        <dl>
          <dt>Customer</dt><dd>{item.customerName}</dd>
          <dt>Business</dt><dd>{item.businessName}</dd>
          <dt>Subscription</dt><dd>{item.reference}</dd>
          <dt>Location</dt><dd>{chosen.locationName}</dd>
          <dt>Preference version</dt><dd>{chosen.preferenceVersion}</dd>
          <dt>Greeting</dt><dd>{chosen.greeting ?? "Not recorded"}</dd>
          <dt>Opening hours</dt><dd>{chosen.hoursSummary ?? "Not recorded"}</dd>
          <dt>Environment</dt><dd>{lane === "dev" ? "DEV" : "Production"}</dd>
          <dt>Provider agent reference</dt><dd>{agentRef.trim()}</dd>
          <dt>Configuration revision</dt><dd>{revision.trim()}</dd>
          <dt>Chosen provider voice</dt><dd>{chosenVoice.trim()}</dd>
          <dt>Chosen provider language</dt><dd>{chosenLanguage.trim()}</dd>
          <dt>Verification</dt><dd>Operator attested. Not independently checked.</dd>
          <dt>Staff attestation</dt><dd>{attestation.trim()}</dd>
          <dt>Service status</dt><dd>Configuration recorded — test pending. The receptionist is not live.</dd>
        </dl>
        <label>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {" "}I confirm an authorised operator recorded this provider evidence for this location. It has not been independently verified, and the receptionist has not been tested.
        </label>
        <p>
          <button type="button" disabled={!confirmed || pending || reviewed !== payloadText} onClick={() => void submit()}>Confirm AI configuration</button>
          {" "}
          <button type="button" onClick={() => { leaveReview(); setOpen(false) }} disabled={pending}>Cancel</button>
        </p>
      </div> : <p><button type="button" onClick={beginReview}>Review configuration</button></p>}
    </section> : null}
    {message ? <Notice tone={tone} live="status">{message}</Notice> : null}
  </div>
}

function allocationStatus(status: AllocationLocationProgress["status"]) {
  if (status === "recorded") return "Number recorded. Not active."
  if (status === "review") return "Number recorded, and it needs review against the latest configuration. Not active."
  return "Number not recorded"
}

function RecordNumberAllocation({ item, providerLane }: { item: SetupQueueItem; providerLane: "dev" | "production" | null }) {
  const router = useRouter()
  const key = useRef("")
  const configuration = item.configurationProgress
  const allocation = item.allocationProgress
  const preferences = item.preferenceProgress
  const preferencesReady = preferences !== null && preferences.locationCount > 0 && preferences.confirmedCount === preferences.locationCount
  const ready = item.operationalStatus === "setup_started"
    && item.subscriptionId !== null
    && item.subscriptionVersion !== null
    && item.customerId !== null
    && item.onboardingRequestId !== null
    && item.onboardingVersion !== null
    && preferencesReady
    && configuration !== null
    && allocation !== null
    && allocation.locationCount > 0
    && configuration.locations.some(location => location.status === "recorded")
  const configurable = configuration?.locations.filter(location => location.status === "recorded") ?? []
  const [open, setOpen] = useState(false)
  const [locationId, setLocationId] = useState(configurable.find(location => allocation?.locations.find(entry => entry.locationId === location.locationId)?.status !== "recorded")?.locationId ?? configurable[0]?.locationId ?? "")
  const [e164, setE164] = useState("")
  const [allocationRef, setAllocationRef] = useState("")
  const [attestation, setAttestation] = useState("")
  const [review, setReview] = useState(false)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [formError, setFormError] = useState<string | null>(null)
  if (!ready || !configuration || !allocation) return null
  if (!providerLane) {
    return <p>The provider lane is not configured for this deployment, so a telephone number cannot be recorded.</p>
  }
  const chosenConfiguration = configurable.find(location => location.locationId === locationId) ?? configurable[0]
  const chosenAllocation = allocation.locations.find(location => location.locationId === chosenConfiguration.locationId)
  if (!chosenConfiguration || !chosenAllocation) return null
  const selectedAllocation = chosenAllocation
  const lane = providerLane
  const laneMatches = chosenConfiguration.environment === lane
  const payloadText = JSON.stringify(allocationPayload(chosenConfiguration, chosenAllocation))
  const reviewFresh = review && reviewed !== null && reviewed === payloadText

  function allocationPayload(location: ConfigurationLocationProgress, recorded: AllocationLocationProgress) {
    return {
      locationId: location.locationId,
      preferenceVersion: location.preferenceVersion,
      provisionVersion: location.provisionVersion,
      configurationVersion: location.configurationVersion,
      allocationVersion: recorded.allocationVersion,
      provider: {
        provider: "telloya_voice",
        environment: lane,
        agentRef: location.agentRef ?? "",
        revision: location.providerRevision ?? "",
        e164: e164.trim(),
        allocationRef: allocationRef.trim(),
        attestation: attestation.trim(),
        staffConfirmed: true,
      },
    }
  }

  function evidenceError() {
    if (!laneMatches) return "This deployment cannot record a number for that provider environment."
    if (!chosenConfiguration.agentRef || !chosenConfiguration.providerRevision) return "Record a current AI configuration before recording a telephone number."
    if (!/^\+[1-9][0-9]{7,14}$/.test(e164.trim())) return "Enter the assigned telephone number in international format, beginning with + and the country code."
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(allocationRef.trim())) return "Enter the provider allocation reference or evidence identifier for this number."
    const trimmedAttestation = attestation.trim()
    if (trimmedAttestation.length < 20 || trimmedAttestation.length > 500) return "Write a staff attestation of 20 to 500 characters describing the allocation evidence."
    return null
  }

  function beginReview() {
    const problem = evidenceError()
    setFormError(problem)
    if (problem) return
    key.current = crypto.randomUUID()
    setReviewed(JSON.stringify(allocationPayload(chosenConfiguration, selectedAllocation)))
    setConfirmed(false)
    setReview(true)
  }

  function leaveReview() {
    setReview(false)
    setConfirmed(false)
    setReviewed(null)
    key.current = ""
  }

  async function submit() {
    const current = allocationPayload(chosenConfiguration, selectedAllocation)
    if (!confirmed || pending || reviewed === null || reviewed !== JSON.stringify(current) || !isUuidKey(key.current)) return
    if (item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return
    const recorded = JSON.parse(reviewed) as ReturnType<typeof allocationPayload>
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/record-number-allocation", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          subscriptionId: item.subscriptionId,
          version: item.subscriptionVersion,
          customerId: item.customerId,
          businessId: item.businessId,
          onboardingRequestId: item.onboardingRequestId,
          onboardingVersion: item.onboardingVersion,
          ...recorded,
        }),
      })
      const body = await response.json().catch(() => null) as { message?: string } | null
      const text = body?.message ?? "We couldn’t record the telephone number. Reload the queue before trying again."
      setMessage(text)
      setTone(response.ok ? "success" : "warning")
      if (response.ok) {
        setOpen(false)
        setReview(false)
        setReviewed(null)
        key.current = ""
        router.refresh()
      }
    } catch {
      setMessage("We couldn’t record the telephone number. Reload the queue before trying again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  const action = chosenAllocation.status === "recorded" ? "Record a corrected allocation" : "Record telephone number"

  return <div>
    <p>Telephone numbers: {allocation.recordedCount} of {allocation.locationCount} {allocation.locationCount === 1 ? "location" : "locations"} recorded.</p>
    <p>{chosenConfiguration.locationName}: {allocationStatus(chosenAllocation.status)}. The number is not active.</p>
    <button type="button" onClick={() => { leaveReview(); setOpen(true) }}>{action}</button>
    {open ? <section aria-label={`Record telephone number for ${item.reference}`}>
      <h3>Record provider and number allocation</h3>
      <p>This records a telephone number that is already assigned to the configured receptionist. It does not buy a number, turn the number on, start forwarding, or place a test call.</p>
      <p>{allocationStatus(chosenAllocation.status)}. {chosenAllocation.status === "recorded" ? `This keeps the earlier record and adds version ${chosenAllocation.allocationVersion + 1}.` : "Forwarding is not ready."}</p>
      <label>Location
        <select value={chosenConfiguration.locationId} onChange={event => { setLocationId(event.target.value); leaveReview() }}>
          {configurable.map(location => {
            const recorded = allocation.locations.find(entry => entry.locationId === location.locationId)
            return <option key={location.locationId} value={location.locationId}>{location.locationName} ({allocationStatus(recorded?.status ?? "needed")})</option>
          })}
        </select>
      </label>
      <h4>Current AI configuration</h4>
      <dl>
        <dt>Customer</dt><dd>{item.customerName}</dd>
        <dt>Business</dt><dd>{item.businessName}</dd>
        <dt>Subscription</dt><dd>{item.reference}</dd>
        <dt>Location</dt><dd>{chosenConfiguration.locationName}</dd>
        <dt>Configuration version</dt><dd>{chosenConfiguration.configurationVersion}</dd>
        <dt>Provider agent</dt><dd>{chosenConfiguration.agentRef}</dd>
        <dt>Provider environment</dt><dd>{lane === "dev" ? "DEV" : "Production"}. This deployment chooses the lane.</dd>
        <dt>Existing allocation</dt><dd>{chosenAllocation.e164 ? `${chosenAllocation.e164}. Recorded. Not active.` : "None recorded"}</dd>
      </dl>
      <h4>Assigned number and provider evidence</h4>
      {laneMatches ? null : <p role="alert">This deployment cannot record a number for that provider environment.</p>}
      <label>Assigned telephone number <input value={e164} onChange={event => setE164(event.target.value)} autoComplete="off" /></label>
      <label>Provider allocation reference <input value={allocationRef} onChange={event => setAllocationRef(event.target.value)} autoComplete="off" /></label>
      <label>Staff attestation <textarea value={attestation} onChange={event => setAttestation(event.target.value)} /></label>
      {formError ? <p role="alert">{formError}</p> : null}
      {reviewFresh ? <div>
        <h4>Check before recording</h4>
        <dl>
          <dt>Customer</dt><dd>{item.customerName}</dd>
          <dt>Business</dt><dd>{item.businessName}</dd>
          <dt>Subscription</dt><dd>{item.reference}</dd>
          <dt>Location</dt><dd>{chosenConfiguration.locationName}</dd>
          <dt>AI configuration</dt><dd>Version {chosenConfiguration.configurationVersion}</dd>
          <dt>Provider agent</dt><dd>{chosenConfiguration.agentRef}</dd>
          <dt>Provider environment</dt><dd>{lane === "dev" ? "DEV" : "Production"}</dd>
          <dt>Assigned telephone number</dt><dd>{e164.trim()}</dd>
          <dt>Provider evidence</dt><dd>{allocationRef.trim()}</dd>
          <dt>Verification</dt><dd>Operator attested. This is not an independent check, and it does not show that the number is routing calls.</dd>
          <dt>Staff attestation</dt><dd>{attestation.trim()}</dd>
          <dt>Existing allocation</dt><dd>{chosenAllocation.status === "recorded" ? `${chosenAllocation.e164}. Recorded. Not active.` : "None recorded"}</dd>
          <dt>Service status</dt><dd>Number recorded — not active. Forwarding is not ready.</dd>
        </dl>
        <label>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {" "}I confirm an authorised operator recorded this assigned number and the provider allocation evidence for this location. Operator attestation is not an independent check, and it does not show that the number is routing calls.
        </label>
        <p>
          <button type="button" disabled={!confirmed || pending || reviewed !== payloadText} onClick={() => void submit()}>Record telephone number</button>
          {" "}
          <button type="button" onClick={() => { leaveReview(); setOpen(false) }} disabled={pending}>Cancel</button>
        </p>
      </div> : <p><button type="button" onClick={beginReview}>Review allocation</button></p>}
    </section> : null}
    {message ? <Notice tone={tone} live="status">{message}</Notice> : null}
  </div>
}

const forwardingNotice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."

const forwardingModes = [
  ["UNANSWERED", "Unanswered calls"],
  ["BUSY", "Busy calls"],
  ["UNREACHABLE", "Unreachable calls"],
  ["UNANSWERED_BUSY_UNREACHABLE", "Unanswered, busy, and unreachable calls"],
] as const

function forwardingText(number: string) {
  return [
    `1. Keep ${number} for the customer’s telephone provider. This is the number calls can be sent to once the receptionist is approved.`,
    "2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line.",
    `3. ${forwardingNotice}`,
  ].join(" ")
}

function startingText(location: ForwardingLocationProgress | null) {
  if (!location?.e164) return ""
  if (location.status === "review" || !location.instructionText?.includes(location.e164)) return forwardingText(location.e164)
  return location.instructionText
}

const forwardingAcknowledgement = "I have reviewed these instructions against the current business location and allocated number. I confirm they are suitable to share with this customer. I understand this will not enable call forwarding or activate the receptionist."
const uncertainForwardingMessage = "We couldn’t confirm whether the forwarding instructions were recorded. Try the same action again without changing the notes."

function uncertainForwardingStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function forwardingLabel(mode: (typeof forwardingModes)[number][0]) {
  return forwardingModes.find(([value]) => value === mode)?.[1] ?? mode
}

type ForwardingRequest = {
  subscriptionId: string
  version: number
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  locationId: string
  preferenceVersion: number
  provisionVersion: number
  configurationVersion: number
  allocationId: string
  allocationVersion: number
  instructionVersion: number
  instruction: {
    environment: "dev" | "production"
    forwardingMode: (typeof forwardingModes)[number][0]
    carrierKnown: boolean
    carrierName: string | null
    customerTelephone: string | null
    instructionRevision: string
    instructionText: string
    attestation: string
    staffConfirmed: true
    status: "DRAFT" | "SHARED"
  }
}

function RecordForwardingInstructions({ item, lane }: { item: SetupQueueItem; lane: "dev" | "production" }) {
  const router = useRouter()
  const draftKey = useRef("")
  const draftFingerprint = useRef("")
  const draftEpoch = useRef(-1)
  const shareKey = useRef("")
  const shareFingerprint = useRef("")
  const shareEpoch = useRef(-1)
  const initial = item.forwardingProgress?.locations.find(location => location.status !== "shared")?.locationId ?? item.forwardingProgress?.locations[0]?.locationId ?? ""
  const [selected, setSelected] = useState(initial)
  const serverLocation: ForwardingLocationProgress | null = item.forwardingProgress?.locations.find(entry => entry.locationId === selected) ?? null
  const [held, setHeld] = useState<{ locationId: string; instructionVersion: number; provisionVersion: number } | null>(null)
  const [mode, setMode] = useState<(typeof forwardingModes)[number][0]>(serverLocation?.forwardingMode ?? "UNANSWERED_BUSY_UNREACHABLE")
  const [carrierKnown, setCarrierKnown] = useState(serverLocation?.carrierKnown === true)
  const [carrierName, setCarrierName] = useState(serverLocation?.carrierName ?? "")
  const [telephone, setTelephone] = useState(serverLocation?.customerTelephone ?? "")
  const [revision, setRevision] = useState(serverLocation?.instructionRevision ?? "guide-0001")
  const [text, setText] = useState(startingText(serverLocation))
  const [attestation, setAttestation] = useState("")
  const [review, setReview] = useState(false)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [pending, setPending] = useState(false)
  const [reconcile, setReconcile] = useState<{ locationId: string; instructionVersion: number; provisionVersion: number; allocationId: string; allocationVersion: number; preferenceVersion: number; configurationVersion: number; subscriptionVersion: number; onboardingVersion: number } | null>(null)
  const place = serverLocation && held?.locationId === serverLocation.locationId
    ? {
      ...serverLocation,
      instructionVersion: Math.max(serverLocation.instructionVersion, held.instructionVersion),
      provisionVersion: Math.max(serverLocation.provisionVersion, held.provisionVersion),
    }
    : serverLocation
  const allocationKey = `${place?.locationId ?? ""}:${place?.allocationId ?? ""}:${place?.allocationVersion ?? 0}:${place?.e164 ?? ""}`
  const [seenAllocation, setSeenAllocation] = useState(allocationKey)
  const [allocationEpoch, setAllocationEpoch] = useState(0)
  if (seenAllocation !== allocationKey) {
    setSeenAllocation(allocationKey)
    setAllocationEpoch(value => value + 1)
    setMode(place?.forwardingMode ?? "UNANSWERED_BUSY_UNREACHABLE")
    setCarrierKnown(place?.carrierKnown === true)
    setCarrierName(place?.carrierName ?? "")
    setTelephone(place?.customerTelephone ?? "")
    setRevision(place?.instructionRevision ?? "guide-0001")
    setText(startingText(place))
    setAttestation("")
    setReview(false)
    setReviewed(null)
    setConfirmed(false)
    setReconcile(null)
  }
  if (held && serverLocation && held.locationId === serverLocation.locationId && serverLocation.instructionVersion >= held.instructionVersion && serverLocation.provisionVersion >= held.provisionVersion) {
    setHeld(null)
  }
  if (reconcile && serverLocation && (
    reconcile.locationId !== serverLocation.locationId
    || serverLocation.instructionVersion !== reconcile.instructionVersion
    || serverLocation.provisionVersion !== reconcile.provisionVersion
    || serverLocation.allocationId !== reconcile.allocationId
    || serverLocation.allocationVersion !== reconcile.allocationVersion
    || serverLocation.preferenceVersion !== reconcile.preferenceVersion
    || serverLocation.configurationVersion !== reconcile.configurationVersion
    || item.subscriptionVersion !== reconcile.subscriptionVersion
    || item.onboardingVersion !== reconcile.onboardingVersion
  )) {
    setReconcile(null)
  }

  function requestBody(status: "DRAFT" | "SHARED"): ForwardingRequest | null {
    if (!place?.allocationId || item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return null
    return {
      subscriptionId: item.subscriptionId,
      version: item.subscriptionVersion,
      customerId: item.customerId,
      businessId: item.businessId,
      onboardingRequestId: item.onboardingRequestId,
      onboardingVersion: item.onboardingVersion,
      locationId: place.locationId,
      preferenceVersion: place.preferenceVersion,
      provisionVersion: place.provisionVersion,
      configurationVersion: place.configurationVersion,
      allocationId: place.allocationId,
      allocationVersion: place.allocationVersion,
      instructionVersion: place.instructionVersion,
      instruction: {
        environment: lane,
        forwardingMode: mode,
        carrierKnown,
        carrierName: carrierKnown ? carrierName.trim() : null,
        customerTelephone: telephone.trim() === "" ? null : telephone.trim(),
        instructionRevision: revision.trim(),
        instructionText: text.trim(),
        attestation: attestation.trim(),
        staffConfirmed: true,
        status,
      },
    }
  }

  const shareBody = requestBody("SHARED")
  const shareText = shareBody ? JSON.stringify(shareBody) : ""
  if (reviewed !== null && reviewed !== shareText) {
    setReviewed(null)
    setConfirmed(false)
    setReview(false)
  }
  const reviewFresh = review && reviewed !== null && reviewed === shareText
  const queueConflict = Boolean(reconcile && serverLocation
    && reconcile.locationId === serverLocation.locationId
    && serverLocation.instructionVersion === reconcile.instructionVersion
    && serverLocation.provisionVersion === reconcile.provisionVersion
    && serverLocation.allocationId === reconcile.allocationId
    && serverLocation.allocationVersion === reconcile.allocationVersion
    && serverLocation.preferenceVersion === reconcile.preferenceVersion
    && serverLocation.configurationVersion === reconcile.configurationVersion
    && item.subscriptionVersion === reconcile.subscriptionVersion
    && item.onboardingVersion === reconcile.onboardingVersion)
  const draftBlocked = place?.status === "shared" || place?.sharedAt !== null
  const readyToReview = Boolean(place?.allocationId && place.e164 && text.includes(place.e164) && text.includes(forwardingNotice) && text.trim().length >= 160 && attestation.trim().length >= 20 && revision.trim().length >= 4 && (!carrierKnown || carrierName.trim().length >= 2) && (telephone.trim() === "" || /^\+[1-9][0-9]{7,14}$/.test(telephone.trim())))

  function clearShareReview() {
    setReview(false)
    setReviewed(null)
    setConfirmed(false)
    shareKey.current = ""
    shareFingerprint.current = ""
  }

  function choose(id: string) {
    const next = item.forwardingProgress?.locations.find(entry => entry.locationId === id) ?? null
    setSelected(id)
    setMode(next?.forwardingMode ?? "UNANSWERED_BUSY_UNREACHABLE")
    setCarrierKnown(next?.carrierKnown === true)
    setCarrierName(next?.carrierName ?? "")
    setTelephone(next?.customerTelephone ?? "")
    setRevision(next?.instructionRevision ?? "guide-0001")
    setText(startingText(next))
    setAttestation("")
    setMessage(null)
    setReconcile(null)
    clearShareReview()
    draftKey.current = ""
    draftFingerprint.current = ""
    draftEpoch.current = -1
  }

  function currentKey(kind: "DRAFT" | "SHARED", fingerprint: string) {
    const keyRef = kind === "DRAFT" ? draftKey : shareKey
    const fingerRef = kind === "DRAFT" ? draftFingerprint : shareFingerprint
    const epochRef = kind === "DRAFT" ? draftEpoch : shareEpoch
    if (fingerRef.current !== fingerprint || epochRef.current !== allocationEpoch || !isUuidKey(keyRef.current)) {
      keyRef.current = crypto.randomUUID()
      fingerRef.current = fingerprint
      epochRef.current = allocationEpoch
    }
    return keyRef.current
  }

  function beginReview() {
    if (!readyToReview || !shareBody) return
    const fingerprint = JSON.stringify(shareBody)
    currentKey("SHARED", fingerprint)
    setReviewed(fingerprint)
    setConfirmed(false)
    setReview(true)
  }

  async function send(kind: "DRAFT" | "SHARED") {
    if (queueConflict || !place?.allocationId || !item.onboardingRequestId || !item.onboardingVersion) return
    if (kind === "DRAFT" && draftBlocked) return
    const live = requestBody(kind)
    if (!live) return
    if (kind === "SHARED" && (!confirmed || reviewed === null || reviewed !== JSON.stringify(requestBody("SHARED")))) return
    const payload: ForwardingRequest = kind === "SHARED" ? JSON.parse(reviewed ?? "") as ForwardingRequest : live
    if (kind === "SHARED" && payload.instruction.staffConfirmed !== true) return
    const fingerprint = JSON.stringify(payload)
    const keyRef = kind === "DRAFT" ? draftKey : shareKey
    const fingerRef = kind === "DRAFT" ? draftFingerprint : shareFingerprint
    const requestKey = currentKey(kind, fingerprint)
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/record-forwarding-instructions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey },
        body: fingerprint,
      })
      const body = await response.json().catch(() => null) as { message?: string; instructionVersion?: number; sharingStatus?: "DRAFT" | "SHARED" } | null
      if (!response.ok) {
        if (uncertainForwardingStatus(response.status)) {
          setMessage(uncertainForwardingMessage)
          setTone("danger")
          return
        }
        keyRef.current = ""
        fingerRef.current = ""
        const versionConflict = response.status === 409 && (body?.message ?? "").includes("have changed")
        if (versionConflict) {
          setHeld(null)
          setReview(false)
          setReviewed(null)
          setConfirmed(false)
          shareKey.current = ""
          shareFingerprint.current = ""
          shareEpoch.current = -1
          setReconcile({
            locationId: payload.locationId,
            instructionVersion: payload.instructionVersion,
            provisionVersion: payload.provisionVersion,
            allocationId: payload.allocationId,
            allocationVersion: payload.allocationVersion,
            preferenceVersion: payload.preferenceVersion,
            configurationVersion: payload.configurationVersion,
            subscriptionVersion: payload.version,
            onboardingVersion: payload.onboardingVersion,
          })
          router.refresh()
        }
        setMessage(body?.message ?? "We couldn’t record the forwarding instructions. Reload the queue before trying again.")
        setTone("warning")
        return
      }
      const nextInstruction = typeof body?.instructionVersion === "number" ? body.instructionVersion : payload.instructionVersion + 1
      const sharing = body?.sharingStatus ?? kind
      const wasShared = place.status === "shared" || place.sharedAt !== null
      setHeld({
        locationId: place.locationId,
        instructionVersion: nextInstruction,
        provisionVersion: sharing === "SHARED" && !wasShared ? place.provisionVersion + 1 : place.provisionVersion,
      })
      keyRef.current = ""
      fingerRef.current = ""
      if (kind === "SHARED") clearShareReview()
      setMessage(body?.message ?? "The forwarding instructions were recorded.")
      setTone("success")
      router.refresh()
    } catch {
      setMessage("We couldn’t record the forwarding instructions. Check the connection and try again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  if (!item.forwardingProgress || item.forwardingProgress.locations.length === 0 || !place) return null
  const reviewedPayload: ForwardingRequest | null = reviewFresh && reviewed ? JSON.parse(reviewed) as ForwardingRequest : null
  return (
    <form className="commercial-command" onSubmit={event => event.preventDefault()}>
      <h3>Record forwarding instructions</h3>
      <p>{item.customerName} · {item.businessName}. These notes explain a later connection. Sharing them does not enable forwarding.</p>
      <label>Location<select value={selected} onChange={event => choose(event.target.value)}>{item.forwardingProgress.locations.map(entry => <option key={entry.locationId} value={entry.locationId}>{entry.locationName} · {entry.status}</option>)}</select></label>
      <dl className="commercial-review">
        <div><dt>Subscription</dt><dd>{item.reference}</dd></div>
        <div><dt>Receptionist</dt><dd>{place.agentRef ?? "Not recorded"}</dd></div>
        <div><dt>Configuration version</dt><dd>{place.configurationVersion}</dd></div>
        <div><dt>Assigned number</dt><dd>{place.e164 ?? "Not recorded"}</dd></div>
        <div><dt>Allocation version</dt><dd>{place.allocationVersion}</dd></div>
        <div><dt>Instruction version</dt><dd>{place.instructionVersion}</dd></div>
        <div><dt>Sharing status</dt><dd>{place.status}</dd></div>
      </dl>
      <label>Forwarding method<select value={mode} onChange={event => setMode(event.target.value as (typeof forwardingModes)[number][0])}>{forwardingModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><input type="checkbox" checked={carrierKnown} onChange={event => setCarrierKnown(event.target.checked)} /> The telephone provider is known</label>
      {carrierKnown ? <label>Telephone provider<input value={carrierName} onChange={event => setCarrierName(event.target.value)} /></label> : <p>Exact settings vary by telephone provider.</p>}
      <label>Customer telephone, if known<input value={telephone} onChange={event => setTelephone(event.target.value)} placeholder="+44…" /></label>
      <label>Instruction revision<input value={revision} onChange={event => setRevision(event.target.value)} /></label>
      <label>Instructions<textarea value={text} onChange={event => setText(event.target.value)} rows={6} /></label>
      <p>{forwardingNotice}</p>
      <label>Staff attestation<textarea value={attestation} onChange={event => setAttestation(event.target.value)} rows={3} /></label>
      {place.status === "review" ? <Notice tone="warning">These instructions need to be prepared again for the current allocation. Use the assigned number above, save a corrected draft or review the corrected notes, then share that version.</Notice> : null}
      {draftBlocked ? <p>A shared instruction stays shared. Review a new version to correct it. A draft cannot replace it.</p> : null}
      {reviewedPayload ? <section aria-label={`Review forwarding instructions for ${item.reference}`}>
        <h4>Review instructions</h4>
        <dl>
          <div><dt>Customer</dt><dd>{item.customerName}</dd></div>
          <div><dt>Business</dt><dd>{item.businessName}</dd></div>
          <div><dt>Subscription</dt><dd>{item.reference}</dd></div>
          <div><dt>Location</dt><dd>{place.locationName}</dd></div>
          <div><dt>Allocation</dt><dd>Version {reviewedPayload.allocationVersion}. {place.e164}</dd></div>
          <div><dt>Receptionist</dt><dd>{place.agentRef ?? "Not recorded"}, configuration version {reviewedPayload.configurationVersion}</dd></div>
          <div><dt>Forwarding method</dt><dd>{forwardingLabel(reviewedPayload.instruction.forwardingMode)}</dd></div>
          <div><dt>Telephone provider</dt><dd>{reviewedPayload.instruction.carrierKnown ? reviewedPayload.instruction.carrierName : "Exact settings vary by telephone provider."}</dd></div>
          {reviewedPayload.instruction.customerTelephone ? <div><dt>Customer telephone</dt><dd>{reviewedPayload.instruction.customerTelephone}</dd></div> : null}
          <div><dt>Instruction revision</dt><dd>{reviewedPayload.instruction.instructionRevision}</dd></div>
          <div><dt>Instructions</dt><dd>{reviewedPayload.instruction.instructionText}</dd></div>
          <div><dt>Warning</dt><dd>{forwardingNotice}</dd></div>
          <div><dt>Staff attestation</dt><dd>{reviewedPayload.instruction.attestation}</dd></div>
        </dl>
        <p>Sharing these instructions makes them visible in the Customer Portal. It does not enable call forwarding or activate the receptionist.</p>
        <label>
          <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {" "}{forwardingAcknowledgement}
        </label>
        <button type="button" disabled={!confirmed || pending || queueConflict} onClick={() => void send("SHARED")}>Confirm and share instructions</button>
      </section> : <button type="button" disabled={pending || !readyToReview || queueConflict} onClick={beginReview}>Review instructions</button>}
      {message ? <Notice tone={tone}><span role="status">{message}</span></Notice> : null}
      <div className="commercial-actions">
        <button type="button" disabled={pending || draftBlocked || !readyToReview || queueConflict} onClick={() => void send("DRAFT")}>Save draft</button>
      </div>
    </form>
  )
}

const testQa = [
  ["greeting", "Correct business greeting"],
  ["languageVoice", "Appropriate spoken language and voice"],
  ["callerIdentity", "Captures the caller name and callback number"],
  ["enquiryDetails", "Collects the relevant enquiry details"],
  ["callbackWindows", "Handles preferred callback windows"],
  ["businessHours", "Follows business hours and out-of-hours rules"],
  ["escalation", "Follows urgent enquiry and escalation instructions"],
  ["avoidsUnsupportedPromises", "Avoids unsupported promises"],
  ["conclusion", "Produces a suitable conclusion"],
] as const

type TestQaKey = (typeof testQa)[number][0]

const testAcknowledgement = "I have reviewed this test against the current configuration, allocation, and shared forwarding instructions. I confirm the QA assessment is my own. I understand a passed conversation test does not verify telephone forwarding or activate the receptionist."

const emptyQa = (): Record<TestQaKey, boolean> => ({
  greeting: false,
  languageVoice: false,
  callerIdentity: false,
  enquiryDetails: false,
  callbackWindows: false,
  businessHours: false,
  escalation: false,
  avoidsUnsupportedPromises: false,
  conclusion: false,
})

function staffCallError(error: Error) {
  if (error.name === "NotAllowedError" || /notallowed|permission denied|microphone|getUserMedia/i.test(`${error.name} ${error.message}`)) {
    return "The microphone was not available, so the browser could not join the controlled web call. Another call was not started."
  }
  if (/provider charge|reconciliation|Do not start another|already recorded|was not opened|not ready/i.test(error.message)) return error.message
  return "The browser could not keep the audio connection. Another call was not started."
}

function InitiateAgentTestCall({ item, lane }: { item: SetupQueueItem; lane: "dev" | "production" }) {
  const router = useRouter()
  const keyRef = useRef("")
  const fingerRef = useRef("")
  const endRef = useRef<(() => void) | null>(null)
  const failedRef = useRef(false)
  const initial = item.testProgress?.locations.find(location => location.status !== "passed")?.locationId ?? item.testProgress?.locations[0]?.locationId ?? ""
  const [selected, setSelected] = useState(initial)
  const place = item.testProgress?.locations.find(entry => entry.locationId === selected) ?? null
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [pending, setPending] = useState(false)
  const [chargeAccepted, setChargeAccepted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [phase, setPhase] = useState<"idle" | "connecting" | "connected" | "ended" | "error">("idle")
  const [callId, setCallId] = useState<string | null>(null)
  const passed = place?.status === "passed"
  useEffect(() => () => { endRef.current?.() }, [])

  function requestBody() {
    if (!place?.allocationId || !place.instructionId || !place.agentRef || !place.e164 || item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return null
    if (place.environment !== lane || passed) return null
    return {
      subscriptionId: item.subscriptionId,
      version: item.subscriptionVersion,
      customerId: item.customerId,
      businessId: item.businessId,
      onboardingRequestId: item.onboardingRequestId,
      onboardingVersion: item.onboardingVersion,
      locationId: place.locationId,
      preferenceVersion: place.preferenceVersion,
      provisionVersion: place.provisionVersion,
      configurationVersion: place.configurationVersion,
      allocationId: place.allocationId,
      allocationVersion: place.allocationVersion,
      instructionId: place.instructionId,
      instructionVersion: place.instructionVersion,
      confirmedCharge: true as const,
    }
  }

  function currentKey(fingerprint: string) {
    if (fingerRef.current !== fingerprint || !isUuidKey(keyRef.current)) {
      keyRef.current = crypto.randomUUID()
      fingerRef.current = fingerprint
    }
    return keyRef.current
  }

  function send() {
    const live = requestBody()
    if (!live || passed || !chargeAccepted || locked || pending) return
    const fingerprint = JSON.stringify(live)
    const requestKey = currentKey(fingerprint)
    setPending(true)
    setMessage(null)
    setPhase("connecting")
    setTone("warning")
    failedRef.current = false
    try {
      const handle = startControlledReceptionistCall({
        endpoint: "/api/commercial/initiate-agent-test-call",
        idempotencyKey: requestKey,
        body: live,
        onStatus: next => {
          if (next === "ended" && failedRef.current) {
            setPending(false)
            setLocked(true)
            return
          }
          setPhase(next)
          if (next === "connected") {
            setMessage("Connected. You can speak to the receptionist. Telephone forwarding is not verified, and the receptionist is not live.")
            setTone("success")
            setPending(false)
            router.refresh()
          }
          if (next === "ended") {
            setMessage("The controlled web call has ended. Telephone forwarding is not verified, and the receptionist is not live.")
            setTone("warning")
            setPending(false)
            setLocked(true)
          }
        },
        onOutcome: outcome => {
          if (outcome === "rejected") {
            keyRef.current = ""
            fingerRef.current = ""
            setLocked(false)
            return
          }
          setLocked(true)
        },
        onCall: call => setCallId(call.callId),
        onError: error => {
          failedRef.current = true
          setPhase("error")
          setMessage(staffCallError(error))
          setTone("danger")
          setPending(false)
          setLocked(true)
        },
      })
      endRef.current = handle.end
    } catch {
      setPhase("error")
      setLocked(true)
      setPending(false)
      setMessage("The browser could not keep the audio connection. Another call was not started.")
      setTone("danger")
    }
  }

  if (!item.testProgress || item.testProgress.locations.length === 0 || !place) return null
  const ready = Boolean(requestBody())
  const liveCall = phase === "connecting" || phase === "connected"
  return (
    <form className="commercial-command" onSubmit={event => event.preventDefault()}>
      <h3>Start controlled receptionist test</h3>
      <p>{item.customerName} · {item.businessName}. This asks the provider to open a web conversation for the configured receptionist and version. It does not place a telephone call, enable forwarding, or make the receptionist live. A typed call reference is not accepted.</p>
      <label>Controlled test location<select value={selected} onChange={event => { setSelected(event.target.value); setCallId(null); setMessage(null); setPhase("idle"); setLocked(false); keyRef.current = ""; fingerRef.current = "" }}>{item.testProgress.locations.map(entry => <option key={entry.locationId} value={entry.locationId}>{entry.locationName} · {entry.status}</option>)}</select></label>
      <dl className="commercial-review">
        <div><dt>Subscription</dt><dd>{item.reference}</dd></div>
        <div><dt>Location</dt><dd>{place.locationName}</dd></div>
        <div><dt>Receptionist</dt><dd>{place.agentRef ?? "Not recorded"}</dd></div>
        <div><dt>Configuration version</dt><dd>{place.configurationVersion}</dd></div>
      </dl>
      {passed ? <Notice tone="success"><span role="status">This location already has a passed conversation test.</span></Notice> : null}
      {!place.instructionId ? <Notice tone="warning">Share the forwarding instructions for this location before opening a controlled web call.</Notice> : null}
      {passed ? null : <label><input type="checkbox" checked={chargeAccepted} onChange={event => setChargeAccepted(event.target.checked)} /> I understand this controlled web call may incur a provider usage charge.</label>}
      {passed ? null : <button type="button" disabled={pending || locked || !ready || !chargeAccepted} onClick={send}>Start controlled test</button>}
      {liveCall ? <button type="button" onClick={() => endRef.current?.()}>End call</button> : null}
      {phase === "connecting" ? <p role="status">Connecting the browser to the controlled web call.</p> : null}
      {callId ? <p role="status">Provider call reference {callId}. Telephone forwarding is not verified, and the receptionist is not live.</p> : null}
      {message ? <Notice tone={tone}><span role="status">{message}</span></Notice> : null}
    </form>
  )
}

function uncertainTestStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function VerifyAgentTestCall({ item, lane }: { item: SetupQueueItem; lane: "dev" | "production" }) {
  const router = useRouter()
  const keyRef = useRef("")
  const fingerRef = useRef("")
  const epochRef = useRef(-1)
  const initial = item.testProgress?.locations.find(location => location.status !== "passed")?.locationId ?? item.testProgress?.locations[0]?.locationId ?? ""
  const [selected, setSelected] = useState(initial)
  const serverLocation = item.testProgress?.locations.find(entry => entry.locationId === selected) ?? null
  const [held, setHeld] = useState<{ locationId: string; provisionVersion: number } | null>(null)
  const [callId, setCallId] = useState("")
  const [checks, setChecks] = useState(emptyQa)
  const [attestation, setAttestation] = useState("")
  const [review, setReview] = useState(false)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<"success" | "warning" | "danger">("warning")
  const [pending, setPending] = useState(false)
  const [reconcile, setReconcile] = useState<{ locationId: string; instructionVersion: number; provisionVersion: number; allocationId: string | null; allocationVersion: number; preferenceVersion: number; configurationVersion: number; subscriptionVersion: number; onboardingVersion: number } | null>(null)
  const place: AgentTestLocationProgress | null = serverLocation && held?.locationId === serverLocation.locationId
    ? { ...serverLocation, provisionVersion: Math.max(serverLocation.provisionVersion, held.provisionVersion) }
    : serverLocation
  const identity = `${place?.locationId ?? ""}:${place?.configurationVersion ?? 0}:${place?.allocationId ?? ""}:${place?.allocationVersion ?? 0}:${place?.instructionId ?? ""}:${place?.instructionVersion ?? 0}:${place?.e164 ?? ""}`
  const [seenIdentity, setSeenIdentity] = useState(identity)
  const [epoch, setEpoch] = useState(0)
  if (seenIdentity !== identity) {
    setSeenIdentity(identity)
    setEpoch(value => value + 1)
    setCallId("")
    setChecks(emptyQa())
    setAttestation("")
    setReview(false)
    setReviewed(null)
    setConfirmed(false)
    setReconcile(null)
  }
  if (held && serverLocation && held.locationId === serverLocation.locationId && serverLocation.provisionVersion >= held.provisionVersion) setHeld(null)
  if (reconcile && serverLocation && (
    reconcile.locationId !== serverLocation.locationId
    || serverLocation.instructionVersion !== reconcile.instructionVersion
    || serverLocation.provisionVersion !== reconcile.provisionVersion
    || serverLocation.allocationId !== reconcile.allocationId
    || serverLocation.allocationVersion !== reconcile.allocationVersion
    || serverLocation.preferenceVersion !== reconcile.preferenceVersion
    || serverLocation.configurationVersion !== reconcile.configurationVersion
    || item.subscriptionVersion !== reconcile.subscriptionVersion
    || item.onboardingVersion !== reconcile.onboardingVersion
  )) setReconcile(null)

  function requestBody() {
    if (!place?.allocationId || !place.instructionId || !place.agentRef || !place.e164 || item.subscriptionId === null || item.subscriptionVersion === null || item.customerId === null || item.onboardingRequestId === null || item.onboardingVersion === null) return null
    if (place.environment !== lane) return null
    return {
      subscriptionId: item.subscriptionId,
      version: item.subscriptionVersion,
      customerId: item.customerId,
      businessId: item.businessId,
      onboardingRequestId: item.onboardingRequestId,
      onboardingVersion: item.onboardingVersion,
      locationId: place.locationId,
      preferenceVersion: place.preferenceVersion,
      provisionVersion: place.provisionVersion,
      configurationVersion: place.configurationVersion,
      allocationId: place.allocationId,
      allocationVersion: place.allocationVersion,
      instructionId: place.instructionId,
      instructionVersion: place.instructionVersion,
      callId: callId.trim(),
      qa: { ...checks, attestation: attestation.trim(), staffConfirmed: true },
    }
  }

  const live = requestBody()
  const liveText = live ? JSON.stringify(live) : ""
  if (reviewed !== null && reviewed !== liveText) {
    setReviewed(null)
    setConfirmed(false)
    setReview(false)
  }
  const reviewFresh = review && reviewed !== null && reviewed === liveText
  const queueConflict = Boolean(reconcile && serverLocation
    && reconcile.locationId === serverLocation.locationId
    && serverLocation.instructionVersion === reconcile.instructionVersion
    && serverLocation.provisionVersion === reconcile.provisionVersion
    && serverLocation.allocationId === reconcile.allocationId
    && serverLocation.allocationVersion === reconcile.allocationVersion
    && serverLocation.preferenceVersion === reconcile.preferenceVersion
    && serverLocation.configurationVersion === reconcile.configurationVersion
    && item.subscriptionVersion === reconcile.subscriptionVersion
    && item.onboardingVersion === reconcile.onboardingVersion)
  const passed = place?.status === "passed"
  const readyToReview = Boolean(live && /^[A-Za-z0-9_-]{8,128}$/.test(callId.trim()) && attestation.trim().length >= 20 && !passed)

  function currentKey(fingerprint: string) {
    if (fingerRef.current !== fingerprint || epochRef.current !== epoch || !isUuidKey(keyRef.current)) {
      keyRef.current = crypto.randomUUID()
      fingerRef.current = fingerprint
      epochRef.current = epoch
    }
    return keyRef.current
  }

  function choose(id: string) {
    setSelected(id)
    setCallId("")
    setChecks(emptyQa())
    setAttestation("")
    setMessage(null)
    setReview(false)
    setReviewed(null)
    setConfirmed(false)
    setReconcile(null)
    keyRef.current = ""
    fingerRef.current = ""
    epochRef.current = -1
  }

  function beginReview() {
    if (!readyToReview || !live) return
    const fingerprint = JSON.stringify(live)
    currentKey(fingerprint)
    setReviewed(fingerprint)
    setConfirmed(false)
    setReview(true)
  }

  async function send() {
    if (queueConflict || passed || !confirmed || reviewed === null || reviewed !== liveText) return
    const payload = JSON.parse(reviewed) as NonNullable<ReturnType<typeof requestBody>>
    if (payload.qa.staffConfirmed !== true) return
    const requestKey = currentKey(reviewed)
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/commercial/verify-agent-test-call", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey },
        body: reviewed,
      })
      const body = await response.json().catch(() => null) as { message?: string; evidenceOutcome?: string; provisionState?: string } | null
      if (!response.ok) {
        if (uncertainTestStatus(response.status)) {
          setMessage(body?.message ?? "We couldn’t confirm whether the provider call could be read. Try the same action again without changing the assessment.")
          setTone("danger")
          return
        }
        keyRef.current = ""
        fingerRef.current = ""
        const versionConflict = response.status === 409 && (body?.message ?? "").includes("have changed")
        if (versionConflict && place) {
          setHeld(null)
          setReview(false)
          setReviewed(null)
          setConfirmed(false)
          epochRef.current = -1
          setReconcile({
            locationId: place.locationId,
            instructionVersion: place.instructionVersion,
            provisionVersion: place.provisionVersion,
            allocationId: place.allocationId,
            allocationVersion: place.allocationVersion,
            preferenceVersion: place.preferenceVersion,
            configurationVersion: place.configurationVersion,
            subscriptionVersion: item.subscriptionVersion ?? 0,
            onboardingVersion: item.onboardingVersion ?? 0,
          })
          router.refresh()
        }
        setMessage(body?.message ?? "We couldn’t record the conversation test. Reload the queue before trying again.")
        setTone("warning")
        return
      }
      keyRef.current = ""
      fingerRef.current = ""
      setReview(false)
      setReviewed(null)
      setConfirmed(false)
      if (body?.evidenceOutcome === "VERIFIED_PASSED" && place) {
        setHeld({ locationId: place.locationId, provisionVersion: place.provisionVersion + 1 })
        setTone("success")
      } else {
        setTone("warning")
      }
      setMessage(body?.message ?? "The conversation test was recorded.")
      router.refresh()
    } catch {
      setMessage("We couldn’t record the conversation test. Check the connection and try again.")
      setTone("danger")
    } finally {
      setPending(false)
    }
  }

  if (!item.testProgress || item.testProgress.locations.length === 0 || !place) return null
  const reviewedPayload = reviewFresh && reviewed ? JSON.parse(reviewed) as NonNullable<ReturnType<typeof requestBody>> : null
  return (
    <form className="commercial-command" onSubmit={event => event.preventDefault()}>
      <h3>Verify AI receptionist test call</h3>
      <p>{item.customerName} · {item.businessName}. This checks a controlled conversation with the configured receptionist. It does not verify telephone forwarding or show that the receptionist is answering calls.</p>
      <label>Location<select value={selected} onChange={event => choose(event.target.value)}>{item.testProgress.locations.map(entry => <option key={entry.locationId} value={entry.locationId}>{entry.locationName} · {entry.status}</option>)}</select></label>
      <dl className="commercial-review">
        <div><dt>Subscription</dt><dd>{item.reference}</dd></div>
        <div><dt>Business</dt><dd>{item.businessName}</dd></div>
        <div><dt>Location</dt><dd>{place.locationName}</dd></div>
        <div><dt>Receptionist</dt><dd>{place.agentRef ?? "Not recorded"}</dd></div>
        <div><dt>Configuration version</dt><dd>{place.configurationVersion}</dd></div>
        <div><dt>Assigned number</dt><dd>{place.e164 ?? "Not recorded"}</dd></div>
        <div><dt>Allocation version</dt><dd>{place.allocationVersion}</dd></div>
        <div><dt>Forwarding instructions</dt><dd>{place.instructionId ? `Shared, version ${place.instructionVersion}` : "Not shared"}</dd></div>
        <div><dt>Latest test</dt><dd>{place.latestOutcome ?? "None recorded"}{place.providerCallId ? ` · ${place.providerCallId}` : ""}</dd></div>
      </dl>
      {passed ? <Notice tone="success"><span role="status">Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live.</span></Notice> : null}
      {place.status === "failed" ? <Notice tone="warning">The last conversation test did not pass. Record a new controlled test when you are ready. Telephone forwarding is not verified.</Notice> : null}
      {!place.instructionId ? <Notice tone="warning">Share the forwarding instructions for this location before recording a conversation test.</Notice> : null}
      {passed ? null : <>
        <label>Provider call reference<input value={callId} onChange={event => setCallId(event.target.value)} /></label>
        <p>The reference is only the lookup key. The server reads the call from the provider. Typing a reference is not proof that the call succeeded, and it does not prove the call was this location’s controlled test. A pass is recorded only when a pre-authorised test session for this location is already bound to that provider call. Typing the reference does not create that binding.</p>
        <fieldset>
          <legend>Human QA</legend>
          {testQa.map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={checks[key]} onChange={event => setChecks(current => ({ ...current, [key]: event.target.checked }))} /> {label}</label>
          ))}
        </fieldset>
        <label>Staff attestation<textarea value={attestation} onChange={event => setAttestation(event.target.value)} rows={3} /></label>
        {reviewedPayload ? <section aria-label={`Review AI receptionist test call for ${item.reference}`}>
          <h4>Review test call</h4>
          <dl>
            <div><dt>Customer</dt><dd>{item.customerName}</dd></div>
            <div><dt>Business</dt><dd>{item.businessName}</dd></div>
            <div><dt>Subscription</dt><dd>{item.reference}</dd></div>
            <div><dt>Location</dt><dd>{place.locationName}</dd></div>
            <div><dt>Receptionist</dt><dd>{place.agentRef}, configuration version {reviewedPayload.configurationVersion}</dd></div>
            <div><dt>Assigned number</dt><dd>{place.e164}</dd></div>
            <div><dt>Forwarding instructions</dt><dd>Shared, version {reviewedPayload.instructionVersion}</dd></div>
            <div><dt>Provider call reference</dt><dd>{reviewedPayload.callId}</dd></div>
            <div><dt>QA</dt><dd>{testQa.map(([key, label]) => `${label}: ${reviewedPayload.qa[key] ? "passed" : "not passed"}`).join(". ")}</dd></div>
            <div><dt>Staff attestation</dt><dd>{reviewedPayload.qa.attestation}</dd></div>
          </dl>
          <p>A provider call that ends successfully still needs this assessment. Recording it does not verify telephone forwarding or activate the receptionist.</p>
          <label>
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            {" "}{testAcknowledgement}
          </label>
          <button type="button" disabled={!confirmed || pending || queueConflict} onClick={() => void send()}>Record verification</button>
          {testQa.some(([key]) => !reviewedPayload.qa[key]) ? <p>A criterion that is not passed is recorded as a failed conversation. It does not advance the service.</p> : null}
        </section> : <button type="button" disabled={pending || !readyToReview || queueConflict} onClick={beginReview}>Review test call</button>}
      </>}
      {message ? <Notice tone={tone}><span role="status">{message}</span></Notice> : null}
    </form>
  )
}

export function SetupQueueView({ items, beginSetupEnabled = false, confirmPreferencesEnabled = false, confirmAiConfigurationEnabled = false, recordNumberAllocationEnabled = false, recordForwardingInstructionsEnabled = false, initiateAgentTestCallEnabled = false, verifyAgentTestCallEnabled = false, providerLane = null }: { items: readonly SetupQueueItem[]; beginSetupEnabled?: boolean; confirmPreferencesEnabled?: boolean; confirmAiConfigurationEnabled?: boolean; recordNumberAllocationEnabled?: boolean; recordForwardingInstructionsEnabled?: boolean; initiateAgentTestCallEnabled?: boolean; verifyAgentTestCallEnabled?: boolean; providerLane?: "dev" | "production" | null }) {
  const later = futureCommands.filter(command => {
    if (beginSetupEnabled && command === "Begin setup") return false
    if (confirmPreferencesEnabled && command === "Confirm business preferences") return false
    if (confirmAiConfigurationEnabled && command === "Confirm AI configuration") return false
    if (recordNumberAllocationEnabled && command === "Record provider and number allocation") return false
    if (recordForwardingInstructionsEnabled && command === "Record forwarding instructions") return false
    if (initiateAgentTestCallEnabled && command === "Start controlled receptionist test") return false
    if (verifyAgentTestCallEnabled && command === "Verify AI receptionist test call") return false
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
                  {confirmAiConfigurationEnabled ? <ConfirmAiConfiguration item={item} providerLane={providerLane} /> : null}
                  {recordNumberAllocationEnabled ? <RecordNumberAllocation item={item} providerLane={providerLane} /> : null}
                  {recordForwardingInstructionsEnabled && providerLane ? <RecordForwardingInstructions item={item} lane={providerLane} /> : null}
                  {initiateAgentTestCallEnabled && providerLane ? <InitiateAgentTestCall item={item} lane={providerLane} /> : null}
                  {verifyAgentTestCallEnabled && providerLane ? <VerifyAgentTestCall item={item} lane={providerLane} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    <h2>Later setup commands</h2>
    <p>These actions are not available from this page. A later phase can record each one as its own audited command. None of them runs because a subscription is financially active. Confirm business preferences records the customer’s confirmed hours and service behaviour for each selected location. Confirm AI configuration records an operator-attested provider configuration for one location. Record provider and number allocation records an assigned telephone number for one location. It does not make that number active, start forwarding, or record a test call. Record forwarding instructions prepares location-specific notes for a later connection. Sharing those notes does not enable forwarding. Start controlled receptionist test asks the provider to open a web conversation for the configured receptionist. It does not place a telephone call or accept a typed call reference. Verify AI receptionist test call checks a controlled conversation. It does not verify telephone forwarding or show that the receptionist is answering calls.</p>
    <ul>
      {later.map(command => <li key={command}>{command}</li>)}
    </ul>
  </>
}
