"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"
import type { ApprovedCommercialPlan, OnboardingView } from "@/lib/commercial/onboarding"
import {
  draftChecklist,
  emptyTelloyaOfferDraft,
  estimateTelloyaDraft,
  mapDraftTierToApprovedPlan,
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

function initialDraft(draft: TelloyaOfferDraftPanel, planTier: string | null): TelloyaOfferDraftSelection {
  if (draft.availability === "ready") {
    return {
      planTier: draft.planTier,
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
  const [draft, setDraft] = useState<TelloyaOfferDraftSelection>(() => initialDraft(draftPanel, workspace.planTier))
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [draftSaving, setDraftSaving] = useState(false)
  const [formOfferSummary, setFormOfferSummary] = useState<{ basis: string; text: string } | null>(null)
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
  const matchedApproved = mapDraftTierToApprovedPlan(offerable, draft.planTier)
  const draftSaved = draft.version > 0
  const canPrepare = Boolean(
    supported
    && request
    && !request.subscriptionId
    && supported.membership === "verified"
    && selectedLocations.length > 0
    && supported.termsConfigured
    && matchedApproved
    && draftSaved
    && draft.planTier
    && draft.planTier !== "custom",
  )
  const guardMismatch = canPrepare && matchedApproved?.guardAddonUnitMinor === 999 && draft.proposedGuardQuantity > 0
    && draft.guardLocationIds.length === 0
  const offerSummaryBasis = `${matchedApproved?.id ?? ""}:${draft.guardLocationIds.join(",")}`
  let draftOfferSummary = "Choose an approved version to see the official offer total."
  if (matchedApproved && matchedApproved.amountMinor !== null) {
    const guards = matchedApproved.guardAddonUnitMinor === 999 ? draft.guardLocationIds.length : 0
    const total = matchedApproved.amountMinor + (matchedApproved.guardAddonUnitMinor ?? 0) * guards
    draftOfferSummary = guards === 0
      ? `Official offer total ${pounds(total)} per month for Telloya alone.`
      : `Official offer total ${pounds(total)} per month. Telloya ${pounds(matchedApproved.amountMinor)} plus Relaunch Guard ${pounds((matchedApproved.guardAddonUnitMinor ?? 0) * guards)} for ${guards} location${guards === 1 ? "" : "s"}.`
  }
  const authoritativeSummary = formOfferSummary?.basis === offerSummaryBasis
    ? formOfferSummary.text
    : draftOfferSummary

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

  function setPlan(tier: TelloyaDraftPlanTier) {
    if (draftLocked) return
    setDraft(current => ({ ...current, planTier: tier }))
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

  async function saveDraft() {
    if (draftLocked || draftSaving) return
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
      if (Number.isInteger(body.version)) {
        setDraft(current => ({ ...current, version: body.version as number }))
      }
      setDraftMessage(typeof body.message === "string" ? body.message : "Draft saved.")
      router.refresh()
    } catch {
      setDraftMessage("We couldn’t save the draft estimate. Reload the enquiry before trying again.")
    } finally {
      setDraftSaving(false)
    }
  }

  function refreshOffer(form: HTMLFormElement) {
    if (!matchedApproved || matchedApproved.amountMinor === null) {
      setFormOfferSummary({
        basis: offerSummaryBasis,
        text: "Choose an approved version to see the official offer total.",
      })
      return
    }
    const data = new FormData(form)
    const guards = matchedApproved.guardQuantity == null && matchedApproved.guardAddonUnitMinor === 999
      ? data.getAll("guardLocationIds").length
      : 0
    const total = matchedApproved.amountMinor + (matchedApproved.guardAddonUnitMinor ?? 0) * guards
    setFormOfferSummary({
      basis: offerSummaryBasis,
      text: guards === 0
        ? `Official offer total ${pounds(total)} per month for Telloya alone.`
        : `Official offer total ${pounds(total)} per month. Telloya ${pounds(matchedApproved.amountMinor)} plus Relaunch Guard ${pounds((matchedApproved.guardAddonUnitMinor ?? 0) * guards)} for ${guards} location${guards === 1 ? "" : "s"}.`,
    })
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
      <fieldset disabled={draftLocked} className="telloya-plan-cards">
        <legend className="sr-only">Telloya plan</legend>
        {telloyaDraftPricingFacts.plans.map(plan => <label key={plan.tier} className="checkbox telloya-plan-card">
          <input
            type="radio"
            name="draftPlanTier"
            value={plan.tier}
            checked={draft.planTier === plan.tier}
            onChange={() => setPlan(plan.tier)}
          />
          <span>
            <strong>{plan.name}</strong>
            {plan.popular ? " · Popular" : ""}
            <br />
            {plan.amountPence === null
              ? "Quotation required"
              : `${formatGbpPence(plan.amountPence)} / month · ${plan.minutesPerMonth} minutes`}
          </span>
        </label>)}
      </fieldset>

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

      {!draftLocked && <p>
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={draftSaving || !draftStorageReady}
        >
          {draft.version > 0 ? "Update draft" : "Save draft"}
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

    {canPrepare && matchedApproved && <div>
      <h3>Prepare official offer</h3>
      <p>Uses the approved catalogue version that matches the saved draft. This creates the commercial offer record without sending email or opening Checkout.</p>
      {guardMismatch && <p className="notice notice-warning" role="status">The draft still has a proposed Guard quantity. Confirm explicit Guard locations before preparing, or clear the proposed quantity and update the draft.</p>}
      <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Prepare offer" payload={form => {
        const guardLocationIds = matchedApproved.guardQuantity == null && matchedApproved.guardAddonUnitMinor === 999
          ? form.getAll("guardLocationIds").map(String)
          : []
        return {
          operation: "prepare_offer",
          version,
          enquiryId,
          planVersionId: matchedApproved.id,
          guardLocationIds,
          reason: form.get("reason"),
        }
      }}>
        <fieldset onChange={event => { if (event.currentTarget.form) refreshOffer(event.currentTarget.form) }}>
          <legend>Approved catalogue version for this draft</legend>
          <input type="hidden" name="planVersionId" value={matchedApproved.id} />
          <p>{planReview(matchedApproved)}</p>
          {matchedApproved.guardAddonUnitMinor === 999 && businessLocations.length > 0 && <>
            <p>Tick same-business locations to include in Relaunch Guard for the official offer. Guard selection does not add Telloya receptionist capacity.</p>
            {businessLocations.map(location => <label key={location.id} className="checkbox">
              <input
                type="checkbox"
                name="guardLocationIds"
                value={location.id}
                defaultChecked={draft.guardLocationIds.includes(location.id)}
              />
              Include {location.name} in Relaunch Guard
              {location.selected ? " · Telloya operating location" : " · Guard-only"}
            </label>)}
          </>}
        </fieldset>
        <p>{authoritativeSummary}</p>
        <Reason label="Why is this official offer being prepared?" />
      </CommandForm>
    </div>}
    {!canPrepare && draftSaved && matchedApproved == null && draft.planTier && draft.planTier !== "custom" && <p className="muted">Save or update the draft to an approved catalogue tier before preparing an official offer.</p>}

    {offerReady && <TelloyaOfferActions offer={offer} />}
    {!offerReady && <p className="muted">{workspace.primaryLabel}</p>}
  </section>
}
