"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"
import type { ApprovedCommercialPlan, OnboardingView } from "@/lib/commercial/onboarding"
import { CommandForm, Reason } from "../records/forms"
import { TelloyaOfferActions, type TelloyaOfferPanel } from "./telloya-offer-actions"

function newKey() {
  return crypto.randomUUID()
}

function pounds(minor: number | null) {
  if (minor === null) return "Not recorded"
  return `£${(minor / 100).toFixed(2)}`
}

function planReview(plan: ApprovedCommercialPlan) {
  const name = plan.tierLabel || "Unscoped approved version"
  const minutes = plan.includedMinutes === null ? "minutes are quoted with this version" : `${plan.includedMinutes} minutes`
  const guard = plan.guardQuantity
    ? `Guard quantity ${plan.guardQuantity}, recorded separately from the Telloya quantity`
    : plan.guardAddonUnitMinor === 999
      ? "Relaunch Guard can be added at £9.99 for each location ticked below."
      : "Relaunch Guard cannot be added to this version."
  return `${name}, version ${plan.versionNumber}. ${pounds(plan.amountMinor)} per month. ${minutes}. ${guard}`
}

export function TelloyaOfferWorkspace({
  enquiryId,
  workspace,
  offer,
  onboarding,
  businessName = "",
  country = "",
}: {
  enquiryId: string
  workspace: TelloyaSalesWorkspace
  offer: TelloyaOfferPanel
  onboarding: OnboardingView
  businessName?: string
  country?: string
}) {
  const router = useRouter()
  const key = useRef(newKey())
  const [status, setStatus] = useState<"working" | "done" | "error">(workspace.needsReconciliation ? "working" : "done")
  const [message, setMessage] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [offerSummary, setOfferSummary] = useState("Choose an approved version to see the offer total.")
  const supported = onboarding.supported ? onboarding : null
  const request = supported?.request ?? null
  const version = request?.version ?? 0
  const plans = supported?.approvedPlans ?? []
  const offerable = plans.filter(plan => plan.offerable)
  const selectedLocations = supported?.locations.filter(item => item.selected) ?? []
  const usableBusinesses = supported?.businesses.filter(item => item.membership !== "revoked") ?? []

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

  function refreshOffer(form: HTMLFormElement) {
    const data = new FormData(form)
    const selected = offerable.find(plan => plan.id === String(data.get("planVersionId") ?? ""))
    if (!selected || selected.amountMinor === null) {
      setOfferSummary("Choose an approved version to see the offer total.")
      return
    }
    const guards = selected.guardQuantity == null && selected.guardAddonUnitMinor === 999 ? data.getAll("guardLocationIds").length : 0
    const total = selected.amountMinor + (selected.guardAddonUnitMinor ?? 0) * guards
    setOfferSummary(guards === 0
      ? `Authoritative offer total ${pounds(total)} per month for Telloya alone.`
      : `Authoritative offer total ${pounds(total)} per month. Telloya ${pounds(selected.amountMinor)} plus Relaunch Guard ${pounds((selected.guardAddonUnitMinor ?? 0) * guards)} for ${guards} location${guards === 1 ? "" : "s"}.`)
  }

  return <section className="panel workspace" aria-labelledby="telloya-offer-workspace-title">
    <p className="eyebrow">Telloya offer</p>
    <h2 id="telloya-offer-workspace-title">Personalised offer workspace</h2>
    <p>Product {workspace.product}. Plan interest {workspace.planInterest}. This workspace reuses the existing commercial records, Customer Portal acceptance, durable email queue and verified payment-evidence framework. It does not send email, open Stripe Checkout, or contact Retell.</p>
    <dl>
      <dt>Customer</dt><dd>{workspace.customerSummary}</dd>
      <dt>Business</dt><dd>{workspace.businessSummary}</dd>
      <dt>Voice location</dt><dd>{workspace.voiceLocationSummary}</dd>
      <dt>Guard</dt><dd>{workspace.guardInterestSummary}</dd>
      <dt>Catalogue preview</dt><dd>{workspace.illustrativeMonthly || "No illustrative total until a plan preference is confirmed. Illustrative only — not an approved price."}</dd>
    </dl>
    {workspace.illustrativeMonthly && <p className="muted">Illustrative catalogue amounts are not approved prices, consent, or a sendable offer.</p>}
    {workspace.exceptions.length > 0 && <div className="notice notice-warning" role="status">
      <p><strong>Needs attention</strong></p>
      <ul>{workspace.exceptions.map(item => <li key={item.code}>{item.message}</li>)}</ul>
    </div>}
    {workspace.blockers.length > 0 && <div className="notice notice-blocked" role="status">
      <p><strong>Not sendable yet</strong></p>
      <ul>{workspace.blockers.map(item => <li key={item.code}>{item.message}</li>)}</ul>
    </div>}
    {status === "working" && <p role="status">Preparing the offer workspace from the completed demonstration…</p>}
    {status === "error" && message && <div className="notice notice-warning" role="alert"><p>{message}</p><p><button type="button" onClick={resume}>Retry sales-context preparation</button></p></div>}
    {status === "done" && message && <p className="muted">{message}</p>}

    {supported && request && supported.step === "business" && usableBusinesses.length > 0 && <div>
      <h3>Confirm business</h3>
      <p>An existing business is not selected automatically. Choose the matching business or create a provisional one.</p>
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
      <p>Enquiry location text is not verified ownership. Confirm one operating location before preparing a sendable offer.</p>
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

    {supported && request && supported.membership === "verified" && selectedLocations.length > 0 && !request.subscriptionId && <>
      <h3>Prepare personalised offer</h3>
      {!supported.termsConfigured || offerable.length === 0
        ? <p>Not sendable — approved Telloya plan catalogue, service agreement and tax treatment are not configured. The draft workspace stays open for review.</p>
        : <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Prepare offer" payload={form => {
          const planVersionId = String(form.get("planVersionId") ?? "")
          const selected = offerable.find(plan => plan.id === planVersionId)
          const guardLocationIds = selected && selected.guardQuantity == null && selected.guardAddonUnitMinor === 999
            ? form.getAll("guardLocationIds").map(String)
            : []
          return { operation: "prepare_offer", version, enquiryId, planVersionId, guardLocationIds, reason: form.get("reason") }
        }}>
          <fieldset onChange={event => { if (event.currentTarget.form) refreshOffer(event.currentTarget.form) }}>
            <legend>Which approved version should this offer use?</legend>
            {offerable.map(plan => <label key={plan.id} className="checkbox"><input type="radio" name="planVersionId" value={plan.id} required />{planReview(plan)}</label>)}
            {offerable.some(plan => plan.guardAddonUnitMinor === 999) && selectedLocations.length > 0 && <>
              <p>Tick a location to include it in Relaunch Guard at £9.99 per month. Leave every box unticked to offer Telloya alone. Guard interest from the enquiry stays unselected until you choose.</p>
              {selectedLocations.map(location => <label key={location.id} className="checkbox"><input type="checkbox" name="guardLocationIds" value={location.id} />Include {location.name} in Relaunch Guard</label>)}
            </>}
          </fieldset>
          <p>{offerSummary}</p>
          <p>Preparing the offer pins the selected approved version. It does not open Checkout, send email, or activate Telloya or Guard.</p>
          <Reason label="Why is this offer being prepared?" />
        </CommandForm>}
    </>}

    <p><strong>{workspace.primaryLabel}</strong></p>
    {!workspace.sendable && <p><button type="button" disabled>Send offer</button></p>}
    <TelloyaOfferActions offer={offer} />
  </section>
}
