"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"
import type { ApprovedCommercialPlan, OnboardingView } from "@/lib/commercial/onboarding"
import {
  draftChecklist,
  draftSaveReady,
  draftSelectionsEqual,
  emptyTelloyaOfferDraft,
  estimateTelloyaDraft,
  formatCustomAmountGbpInput,
  mapDraftTierToApprovedPlan,
  parseCustomAmountGbpInput,
  telloyaDraftPricingFacts,
  type TelloyaDraftPlanTier,
  type TelloyaOfferDraftPanel,
  type TelloyaOfferDraftSelection,
} from "@/lib/commercial/telloya-offer-draft"
import { formatGbpPence } from "@/lib/commercial/telloya-offer"
import { CommandForm, Reason } from "../records/forms"
import { TelloyaOfferActions, type TelloyaOfferPanel } from "./telloya-offer-actions"

function newKey() {
  return crypto.randomUUID()
}

function pounds(minor: number | null) {
  if (minor === null) return "Not recorded"
  return formatGbpPence(minor)
}

function planReview(plan: ApprovedCommercialPlan) {
  const name = plan.tierLabel || "Unscoped approved version"
  const minutes = plan.includedMinutes === null ? "minutes are quoted with this version" : `${plan.includedMinutes} minutes`
  return `${name}, version ${plan.versionNumber}. ${pounds(plan.amountMinor)} per month. ${minutes}.`
}

function selectionFromPanel(draft: TelloyaOfferDraftPanel, planTier: string | null): TelloyaOfferDraftSelection {
  if (draft.availability === "ready") {
    return {
      planTier: draft.planTier,
      customAmountPence: draft.customAmountPence,
      customIncludedMinutes: draft.customIncludedMinutes,
      customRequirements: draft.customRequirements,
      proposedGuardQuantity: draft.proposedGuardQuantity,
      guardLocationIds: draft.guardLocationIds,
      overageOptIn: draft.overageOptIn,
      overageCapPence: draft.overageCapPence,
      notes: draft.notes,
      version: draft.version,
    }
  }
  return emptyTelloyaOfferDraft(planTier)
}

function standardAmountLabel(tier: TelloyaDraftPlanTier | null): string {
  const plan = telloyaDraftPricingFacts.plans.find(item => item.tier === tier)
  if (!plan || plan.amountPence === null) return ""
  return formatGbpPence(plan.amountPence)
}

export function TelloyaOfferWorkspace({
  enquiryId,
  workspace,
  offer,
  onboarding,
  draft: draftPanel,
  businessName = "",
  country = "",
}: {
  enquiryId: string
  workspace: TelloyaSalesWorkspace
  offer: TelloyaOfferPanel
  onboarding: OnboardingView
  draft: TelloyaOfferDraftPanel
  businessName?: string
  country?: string
}) {
  const router = useRouter()
  const key = useRef(newKey())
  const draftKey = useRef(newKey())
  const [status, setStatus] = useState<"working" | "done" | "error">(workspace.needsReconciliation ? "working" : "done")
  const [message, setMessage] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const initial = selectionFromPanel(draftPanel, workspace.planTier)
  const [draft, setDraft] = useState<TelloyaOfferDraftSelection>(() => initial)
  const [persistedDraft, setPersistedDraft] = useState<TelloyaOfferDraftSelection>(() => initial)
  const [customAmountText, setCustomAmountText] = useState(() => formatCustomAmountGbpInput(initial.customAmountPence))
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [previewMessage, setPreviewMessage] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [preview, setPreview] = useState<{
    subject: string
    text: string
    html: string
    recipient: string | null
    previewMode: "draft_estimate" | "approved_offer"
    sendable: boolean
  } | null>(null)
  const previewKey = useRef(newKey())
  const supported = onboarding.supported ? onboarding : null
  const request = supported?.request ?? null
  const version = request?.version ?? 0
  const plans = supported?.approvedPlans ?? []
  const offerable = plans.filter(plan => plan.offerable)
  const businessLocations = supported?.locations ?? []
  const selectedLocations = businessLocations.filter(item => item.selected)
  const usableBusinesses = supported?.businesses.filter(item => item.membership !== "revoked") ?? []
  const offerReady = offer.availability === "ready"
  const draftStorageReady = draftPanel.availability === "ready"
  const draftLocked = draftPanel.availability === "locked" || Boolean(request?.subscriptionId) || offerReady
  const estimate = useMemo(() => estimateTelloyaDraft({
    planTier: draft.planTier,
    customAmountPence: draft.customAmountPence,
    customIncludedMinutes: draft.customIncludedMinutes,
    proposedGuardQuantity: draft.guardLocationIds.length > 0 ? draft.guardLocationIds.length : draft.proposedGuardQuantity,
    overageOptIn: draft.overageOptIn,
    overageCapPence: draft.overageCapPence,
  }), [draft])
  const checklist = draftChecklist({
    termsConfigured: supported?.termsConfigured === true,
    offerablePlans: offerable.length,
    membershipVerified: supported?.membership === "verified",
    selectedLocations: selectedLocations.length,
    offerReady,
    mailReady: offer.availability === "ready",
  })
  const unsavedChanges = !draftSelectionsEqual(draft, persistedDraft)
  const draftSavedClean = persistedDraft.version > 0 && !unsavedChanges
  const savedGuardUnresolved = draftSavedClean
    && persistedDraft.proposedGuardQuantity > 0
    && persistedDraft.guardLocationIds.length === 0
  const matchedApproved = mapDraftTierToApprovedPlan(offerable, persistedDraft.planTier, {
    customAmountPence: persistedDraft.customAmountPence,
    customIncludedMinutes: persistedDraft.customIncludedMinutes,
  })
  const canApproveSend = Boolean(
    supported
    && request
    && !request.subscriptionId
    && supported.membership === "verified"
    && selectedLocations.length > 0
    && supported.termsConfigured
    && matchedApproved
    && draftSavedClean
    && !savedGuardUnresolved
    && persistedDraft.planTier,
  )
  const canResumeApproveSend = offer.availability === "ready"
    && offer.state === "OFFERED"
    && !offer.emailQueued
  const quoteSavedBlocked = draftSavedClean && !canApproveSend && !offerReady
  let officialSummary = "Choose an approved version to see the official offer total."
  if (matchedApproved && matchedApproved.amountMinor !== null) {
    const guards = matchedApproved.guardAddonUnitMinor === 999 ? persistedDraft.guardLocationIds.length : 0
    const total = matchedApproved.amountMinor + (matchedApproved.guardAddonUnitMinor ?? 0) * guards
    officialSummary = guards === 0
      ? `Official offer total ${pounds(total)} per month for Telloya alone.`
      : `Official offer total ${pounds(total)} per month. Telloya ${pounds(matchedApproved.amountMinor)} plus Relaunch Guard ${pounds((matchedApproved.guardAddonUnitMinor ?? 0) * guards)} for ${guards} location${guards === 1 ? "" : "s"}.`
  }

  useEffect(() => {
    if (!workspace.needsReconciliation) return
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/enquiries/telloya-sales-context", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": key.current,
          },
          body: JSON.stringify({ enquiryId, operation: "bootstrap" }),
        })
        const body = await response.json().catch(() => ({ message: "We couldn’t prepare the offer workspace." }))
        if (!active) return
        if (!response.ok) {
          setStatus("error")
          setMessage(typeof body.message === "string" ? body.message : "We couldn’t prepare the offer workspace.")
          return
        }
        setStatus("done")
        setMessage(typeof body.message === "string" ? body.message : null)
        router.refresh()
      } catch {
        if (!active) return
        setStatus("error")
        setMessage("We couldn’t prepare the offer workspace. Reload the enquiry before trying again.")
      }
    })()
    return () => { active = false }
  }, [enquiryId, router, workspace.needsReconciliation, retryToken])

  function resume() {
    key.current = newKey()
    setMessage(null)
    setStatus("working")
    setRetryToken(value => value + 1)
  }

  function setPlan(tier: TelloyaDraftPlanTier | "") {
    if (draftLocked) return
    if (tier === "") {
      setDraft(current => ({
        ...current,
        planTier: null,
        customAmountPence: null,
        customIncludedMinutes: null,
        customRequirements: "",
      }))
      setCustomAmountText("")
      return
    }
    if (tier === "custom") {
      setDraft(current => ({ ...current, planTier: tier }))
      return
    }
    setDraft(current => ({
      ...current,
      planTier: tier,
      customAmountPence: null,
      customIncludedMinutes: null,
      customRequirements: "",
    }))
    setCustomAmountText("")
  }

  function setGuardQuantity(value: number) {
    if (draftLocked) return
    const next = Number.isFinite(value) ? Math.max(0, Math.min(50, Math.trunc(value))) : 0
    setDraft(current => ({ ...current, proposedGuardQuantity: next, guardLocationIds: [] }))
  }

  function toggleGuardLocation(locationId: string) {
    if (draftLocked) return
    setDraft(current => {
      const exists = current.guardLocationIds.includes(locationId)
      const guardLocationIds = exists
        ? current.guardLocationIds.filter(id => id !== locationId)
        : [...current.guardLocationIds, locationId]
      return { ...current, guardLocationIds, proposedGuardQuantity: guardLocationIds.length }
    })
  }

  async function previewEmail() {
    if (previewBusy) return
    setPreviewBusy(true)
    setPreviewMessage(null)
    previewKey.current = newKey()
    try {
      const response = await fetch("/api/enquiries/offer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": previewKey.current,
        },
        body: JSON.stringify({
          operation: "preview",
          enquiryId,
        }),
      })
      const body = await response.json().catch(() => ({ message: "We couldn’t preview the offer email." }))
      if (!response.ok) {
        setPreview(null)
        setPreviewMessage(typeof body.message === "string" ? body.message : "We couldn’t preview the offer email.")
        return
      }
      const previewMode = body.previewMode === "approved_offer" ? "approved_offer" : "draft_estimate"
      setPreview({
        subject: typeof body.subject === "string" ? body.subject : "",
        text: typeof body.text === "string" ? body.text : "",
        html: typeof body.html === "string" ? body.html : "",
        recipient: typeof body.recipient === "string" ? body.recipient : null,
        previewMode,
        sendable: false,
      })
      setPreviewMessage(
        typeof body.message === "string"
          ? body.message
          : previewMode === "draft_estimate"
            ? "Illustrative draft — not an approved offer; no email sent."
            : "Email preview ready. Nothing was queued or sent.",
      )
    } catch {
      setPreview(null)
      setPreviewMessage("We couldn’t preview the offer email. Reload the enquiry before trying again.")
    } finally {
      setPreviewBusy(false)
    }
  }

  async function saveDraft() {
    if (draftLocked || draftSaving || !draftSaveReady(draft)) return
    setDraftSaving(true)
    setDraftMessage(null)
    draftKey.current = newKey()
    try {
      const response = await fetch("/api/enquiries/telloya-offer-draft", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": draftKey.current,
        },
        body: JSON.stringify({
          enquiryId,
          expectedVersion: draft.version,
          planTier: draft.planTier,
          customAmountPence: draft.planTier === "custom" ? draft.customAmountPence : null,
          customIncludedMinutes: draft.planTier === "custom" ? draft.customIncludedMinutes : null,
          customRequirements: draft.planTier === "custom" ? draft.customRequirements : "",
          proposedGuardQuantity: draft.proposedGuardQuantity,
          guardLocationIds: draft.guardLocationIds,
          overageOptIn: draft.overageOptIn,
          overageCapPence: draft.overageCapPence,
          notes: draft.notes,
        }),
      })
      const body = await response.json().catch(() => ({ message: "We couldn’t save the draft estimate." }))
      if (!response.ok) {
        setDraftMessage(typeof body.message === "string" ? body.message : "We couldn’t save the draft estimate.")
        return
      }
      const nextVersion = Number.isInteger(body.version) ? body.version as number : draft.version
      const saved: TelloyaOfferDraftSelection = {
        ...draft,
        customAmountPence: draft.planTier === "custom" ? draft.customAmountPence : null,
        customIncludedMinutes: draft.planTier === "custom" ? draft.customIncludedMinutes : null,
        customRequirements: draft.planTier === "custom" ? draft.customRequirements : "",
        version: nextVersion,
      }
      setDraft(saved)
      setPersistedDraft(saved)
      setDraftMessage(typeof body.message === "string" ? body.message : "Draft saved.")
      router.refresh()
    } catch {
      setDraftMessage("We couldn’t save the draft estimate. Reload the enquiry before trying again.")
    } finally {
      setDraftSaving(false)
    }
  }

  return <section className="panel workspace" aria-labelledby="telloya-offer-workspace-title">
    <p className="eyebrow">Telloya offer</p>
    <h2 id="telloya-offer-workspace-title">Personalised offer workspace</h2>
    <dl>
      <dt>Customer</dt><dd>{workspace.customerSummary}</dd>
      <dt>Business</dt><dd>{workspace.businessSummary}</dd>
      <dt>Voice location</dt><dd>{workspace.voiceLocationSummary}</dd>
      <dt>Enquiry plan interest</dt><dd>{workspace.planInterest}</dd>
    </dl>

    {status === "working" && <p role="status">Preparing the offer workspace from the completed demonstration…</p>}
    {status === "error" && message && <div className="notice notice-warning" role="alert"><p>{message}</p><p><button type="button" onClick={resume}>Retry sales-context preparation</button></p></div>}
    {status === "done" && message && <p className="muted">{message}</p>}

    {supported && request && supported.step === "business" && usableBusinesses.length > 0 && <div>
      <h3>Confirm business</h3>
      <p>Choose the matching business or create a provisional one.</p>
      {usableBusinesses.map(business => <CommandForm
        key={business.id}
        endpoint="telloya-sales-context"
        actionUrl="/api/enquiries/telloya-sales-context"
        submitLabel={`Confirm ${business.name || "this business"}`}
        payload={() => ({ operation: "confirm_business", enquiryId, businessId: business.id })}
      >
        <p>{business.name} · {business.membership === "verified" ? "Authority verified" : "Authority pending"}</p>
      </CommandForm>)}
      <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Create provisional business" payload={form => ({
        operation: "match_business",
        version,
        enquiryId,
        create: true,
        name: form.get("name"),
        website: form.get("website") || "",
        membership: "pending",
        reason: form.get("reason"),
      })}>
        <label>Business name<input name="name" required maxLength={200} defaultValue={businessName} /></label>
        <label>Website (optional)<input name="website" type="url" maxLength={2048} defaultValue="" /></label>
        <Reason label="Why is a provisional business needed?" />
      </CommandForm>
    </div>}

    {supported && request && (supported.step === "locations" || (selectedLocations.length === 0 && request.businessId)) && <div>
      <h3>Confirm operating location</h3>
      <p>Confirm one operating location before preparing an official offer.</p>
      {supported.locations.map(location => <CommandForm
        key={location.id}
        endpoint="telloya-sales-context"
        actionUrl="/api/enquiries/telloya-sales-context"
        submitLabel={`Confirm ${location.name || "this location"}`}
        payload={() => ({ operation: "confirm_location", enquiryId, locationId: location.id })}
      >
        <p>{location.name} · {location.country}</p>
      </CommandForm>)}
      <CommandForm endpoint="telloya-sales-context" actionUrl="/api/enquiries/telloya-sales-context" submitLabel="Add proposed location" payload={form => ({
        operation: "create_location",
        enquiryId,
        locationName: form.get("locationName"),
        country: form.get("country"),
      })}>
        <label>Location name<input name="locationName" required maxLength={200} defaultValue={businessName || "Primary location"} /></label>
        <label>Country<input name="country" required maxLength={100} defaultValue={country || "United Kingdom"} /></label>
      </CommandForm>
    </div>}

    <div className="telloya-offer-calculator">
      <h3>Choose Telloya plan</h3>
      <p className="muted">Draft estimate only. Changing a draft is not customer consent and does not create an official offer.</p>
      <label>Plan
        <select
          value={draft.planTier ?? ""}
          disabled={draftLocked}
          onChange={event => setPlan(event.target.value as TelloyaDraftPlanTier | "")}
        >
          <option value="">Choose a plan</option>
          {telloyaDraftPricingFacts.plans.map(plan => <option key={plan.tier} value={plan.tier}>
            {plan.name}
            {plan.amountPence === null
              ? " — enter amount"
              : ` — ${formatGbpPence(plan.amountPence)} / ${plan.minutesPerMonth} min`}
          </option>)}
        </select>
      </label>

      {draft.planTier && draft.planTier !== "custom" && <label>Monthly amount (£)
        <input type="text" readOnly value={standardAmountLabel(draft.planTier).replace("£", "")} />
      </label>}

      {draft.planTier === "custom" && <>
        <label>Monthly amount (£)
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={customAmountText}
            disabled={draftLocked}
            onChange={event => {
              const next = event.target.value
              setCustomAmountText(next)
              setDraft(current => ({
                ...current,
                customAmountPence: parseCustomAmountGbpInput(next),
              }))
            }}
          />
        </label>
        <details>
          <summary>Custom details</summary>
          <label>Included minutes
            <input
              type="number"
              min={1}
              max={telloyaDraftPricingFacts.customIncludedMinutesMax}
              value={draft.customIncludedMinutes ?? ""}
              disabled={draftLocked}
              onChange={event => {
                const raw = event.target.value.trim()
                if (raw === "") {
                  setDraft(current => ({ ...current, customIncludedMinutes: null }))
                  return
                }
                const minutes = Number(raw)
                if (!Number.isInteger(minutes) || minutes < 1 || minutes > telloyaDraftPricingFacts.customIncludedMinutesMax) {
                  setDraft(current => ({ ...current, customIncludedMinutes: null }))
                  return
                }
                setDraft(current => ({ ...current, customIncludedMinutes: minutes }))
              }}
            />
          </label>
          <label>Special requirements
            <textarea
              maxLength={1000}
              value={draft.customRequirements}
              disabled={draftLocked}
              onChange={event => setDraft(current => ({
                ...current,
                customRequirements: event.target.value.slice(0, 1000),
              }))}
            />
          </label>
          <p className="muted">Included minutes must be confirmed before an official Custom offer can be prepared. A Custom amount is a proposed price only until commercial approval creates a matching approved plan version.</p>
        </details>
      </>}

      <h3>Relaunch Guard</h3>
      <p className="muted">Optional at {formatGbpPence(telloyaDraftPricingFacts.guardUnitPence)} per location / month. Off by default. Guard locations are chosen separately from the single Telloya receptionist operating location and do not add receptionist capacity.</p>
      {businessLocations.length > 0
        ? <fieldset disabled={draftLocked}>
          <legend className="sr-only">Relaunch Guard locations</legend>
          {businessLocations.map(location => <label key={location.id} className="checkbox">
            <input
              type="checkbox"
              checked={draft.guardLocationIds.includes(location.id)}
              onChange={() => toggleGuardLocation(location.id)}
            />
            Include {location.name} in Relaunch Guard
            {location.selected ? " · Telloya operating location" : " · Guard-only (no extra receptionist)"}
          </label>)}
        </fieldset>
        : <label>Proposed Guard quantity
          <input
            type="number"
            min={0}
            max={50}
            value={draft.proposedGuardQuantity}
            disabled={draftLocked}
            onChange={event => setGuardQuantity(Number(event.target.value))}
          />
          <span className="muted"> Draft estimate only until business locations are available for explicit Guard selection.</span>
        </label>}

      <details>
        <summary>Optional overage policy</summary>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.overageOptIn}
            disabled={draftLocked}
            onChange={event => setDraft(current => ({
              ...current,
              overageOptIn: event.target.checked,
              overageCapPence: event.target.checked ? current.overageCapPence : null,
            }))}
          />
          Propose overage in the offer at {formatGbpPence(telloyaDraftPricingFacts.overageRatePence)}/min
        </label>
        {draft.overageOptIn && <label>Proposed spending cap (£)
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={draft.overageCapPence == null ? "" : (draft.overageCapPence / 100).toFixed(2)}
            disabled={draftLocked}
            onChange={event => {
              const raw = event.target.value.trim()
              if (raw === "") {
                setDraft(current => ({ ...current, overageCapPence: null }))
                return
              }
              const poundsValue = Number(raw)
              if (!Number.isFinite(poundsValue) || poundsValue <= 0) {
                setDraft(current => ({ ...current, overageCapPence: null }))
                return
              }
              setDraft(current => ({
                ...current,
                overageCapPence: Math.max(1, Math.round(poundsValue * 100)),
              }))
            }}
          />
        </label>}
        <p className="muted">This is a proposed offer term only. It is not customer consent. Charging still requires authenticated customer opt-in and a customer-approved spending cap. Overage is never part of the fixed monthly total.</p>
      </details>

      <label>Special notes
        <textarea
          maxLength={1000}
          value={draft.notes}
          disabled={draftLocked}
          onChange={event => setDraft(current => ({ ...current, notes: event.target.value.slice(0, 1000) }))}
        />
      </label>

      <div className="notice" role="status">
        <p><strong>Draft estimate</strong></p>
        <ul>{estimate.summaryLines.map(line => <li key={line}>{line}</li>)}</ul>
        <p><strong>{estimate.totalLabel}</strong></p>
      </div>

      {unsavedChanges && persistedDraft.version > 0 && <p className="notice notice-warning" role="status">Unsaved changes. Update the draft before preparing an official offer.</p>}
      {!draftLocked && <p>
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={draftSaving || !draftStorageReady || !draftSaveReady(draft)}
        >
          {persistedDraft.version > 0 ? "Update draft" : "Save draft"}
        </button>
      </p>}
      {!draftLocked && !draftStorageReady && <p className="muted">Draft saving will be available after DEV setup. The calculator still works for this session.</p>}
      {draftLocked && <p className="muted">Draft editing is locked because this request is closed or an official offer already exists.</p>}
      {draftMessage && <p className="muted" role="status">{draftMessage}</p>}
    </div>

    <div>
      <h3>Before this can be sent</h3>
      <ul className="telloya-send-checklist">
        {checklist.map(item => <li key={item.code}>{item.ready ? "✓" : "○"} {item.label}</li>)}
      </ul>
    </div>

    {draftSavedClean && persistedDraft.planTier === "custom" && matchedApproved == null && <p className="notice" role="status">
      Custom draft saved — approval required to issue offer. Convert this proposed amount through the existing commercial plan-approval process, then reload so the approved Custom version matches the saved draft.
    </p>}

    {savedGuardUnresolved && <p className="notice notice-warning" role="status">
      The saved draft still has a proposed Guard quantity. Confirm explicit Guard locations and update the draft, or clear the proposed quantity, before preparing an official offer.
    </p>}

    {quoteSavedBlocked && <div className="notice notice-warning" role="status">
      <p>Quote saved — cannot send yet.</p>
      <ul>
        {checklist.filter(item => !item.ready && item.code !== "offer" && item.code !== "mail").map(item => <li key={item.code}>{item.label}</li>)}
        {workspace.blockers.map(item => <li key={item.code}>{item.message}</li>)}
        {workspace.exceptions.map(item => <li key={item.code}>{item.message}</li>)}
        {savedGuardUnresolved && <li>Confirm explicit Guard locations or clear the proposed quantity.</li>}
        {persistedDraft.planTier === "custom" && matchedApproved == null && <li>Custom draft still needs a matching approved catalogue version.</li>}
      </ul>
    </div>}

    {canApproveSend && matchedApproved && <div>
      <h3>Review &amp; approve</h3>
      <p>Uses the saved draft version {persistedDraft.version} and the matching approved catalogue version. Approve &amp; Send prepares the commercial offer and queues the personalised email. Queued does not mean delivered. Draft save never sends email.</p>
      <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Approve & Send Offer" payload={form => ({
        operation: "approve_send",
        enquiryId,
        expectedDraftVersion: persistedDraft.version,
        reason: form.get("reason"),
      })}>
        <fieldset>
          <legend>Itemised quote for this saved draft</legend>
          <p>{planReview(matchedApproved)}</p>
          {matchedApproved.guardAddonUnitMinor === 999 && <p className="muted">
            Relaunch Guard locations from the saved draft: {persistedDraft.guardLocationIds.length === 0
              ? "none"
              : persistedDraft.guardLocationIds.map(id => businessLocations.find(location => location.id === id)?.name ?? id).join(", ")}.
          </p>}
          <p>{officialSummary}</p>
        </fieldset>
        <Reason label="Why is this offer being approved and sent?" />
      </CommandForm>
    </div>}

    {canResumeApproveSend && offer.availability === "ready" && <div>
      <h3>Approve &amp; Send Offer</h3>
      <p>The commercial offer is already prepared. Approving queues the personalised email. Queued does not mean delivered.</p>
      <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Approve & Send Offer" payload={form => ({
        operation: "approve_send",
        enquiryId,
        expectedDraftVersion: Math.max(persistedDraft.version, 1),
        subscriptionId: offer.subscriptionId,
        expectedVersion: offer.version,
        reason: form.get("reason"),
      })}>
        <Reason label="Why is this offer being approved and sent?" />
      </CommandForm>
    </div>}

    {!canApproveSend && draftSavedClean && matchedApproved == null && persistedDraft.planTier && persistedDraft.planTier !== "custom" && <p className="muted">An approved catalogue version matching the saved draft is required before Approve &amp; Send.</p>}
    {!canApproveSend && unsavedChanges && persistedDraft.version > 0 && <p className="muted">Save or discard unsaved calculator changes before Approve &amp; Send.</p>}

    <div>
      <h3>Preview email</h3>
      <p className="muted">Read-only composition from the saved draft or linked offer. Preview does not queue or send email.</p>
      <p><button type="button" onClick={() => void previewEmail()} disabled={previewBusy || persistedDraft.version < 1}>Preview email</button></p>
      {previewMessage && <p className="muted" role="status">{previewMessage}</p>}
      {preview && <div className="email-preview notice" role="region" aria-label="Offer email preview">
        {preview.previewMode === "draft_estimate"
          ? <p role="status"><strong>Illustrative draft — not an approved offer; no email sent</strong></p>
          : <p role="status">Approved-offer composition preview. Nothing was queued or sent.</p>}
        <p><span className="email-preview-label">Recipient</span> <span>{preview.recipient || "Not set"}</span></p>
        <p><span className="email-preview-label">Subject</span> <span>{preview.subject || "No subject"}</span></p>
        <iframe
          className="email-preview-frame email-preview-frame-branded"
          title={preview.previewMode === "draft_estimate" ? "Telloya draft estimate email preview" : "Telloya offer email preview"}
          sandbox=""
          srcDoc={preview.html || "<p>No HTML body</p>"}
        />
        <details>
          <summary>Plain-text version</summary>
          <pre>{preview.text || "(empty)"}</pre>
        </details>
      </div>}
    </div>

    {offerReady && <TelloyaOfferActions offer={offer} />}
    {!offerReady && <p className="muted">{workspace.primaryLabel}</p>}
  </section>
}
