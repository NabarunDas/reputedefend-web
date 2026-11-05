"use client"
import { useState } from "react"
import { CommandForm, Reason } from "../records/forms"
import { Badge } from "../ui"
import { ukDate } from "@/lib/admin/activity"
import { operationLabels, productLabels, stateLabels, type ApprovedCommercialPlan, type OnboardingView } from "@/lib/commercial/onboarding"
import type { InvitationMail } from "@/lib/commercial/invitation-mail"

const steps = ["Product", "Customer", "Business", "Locations", "Next action"] as const

const tierLabels: Record<string, string> = { basic: "Basic", growth: "Growth", pro: "Pro", custom: "Custom" }

function pounds(minor: number | null) {
  if (minor === null) return "Not recorded"
  return `£${(minor / 100).toFixed(2)}`
}

const unavailableReasons: Record<string, string> = {
  conditions: "Missing approved commercial conditions",
  locations: "Unsupported location count",
  tier: "Wrong product or tier",
  price: "Invalid or incomplete pricing",
  agreement: "Missing agreement",
  quotation: "Quotation required",
}

function planReview(plan: ApprovedCommercialPlan) {
  const name = plan.tierLabel || "Unscoped approved version"
  const minutes = plan.includedMinutes === null ? "minutes are quoted with this version" : `${plan.includedMinutes} minutes`
  const guard = plan.guardQuantity
    ? `Guard quantity ${plan.guardQuantity}, recorded separately from the Telloya quantity`
    : plan.guardAddonUnitMinor === 999
      ? "Relaunch Guard can be added at £9.99 for each location ticked below."
      : "Relaunch Guard cannot be added to this version."
  const schedule = plan.matchesApprovedSchedule
    ? "This version matches the approved schedule."
    : "This approved version is not the published schedule. Review the recorded price before preparing the offer."
  const conditions = plan.conditionsStatus === "APPROVED" ? "Conditions are approved." : "Conditions are not approved yet."
  return `${name}, version ${plan.versionNumber}. ${pounds(plan.amountMinor)} per month. ${minutes}. Telloya quantity ${plan.telloyaQuantity ?? "not recorded"}. ${guard} ${conditions} ${schedule}`
}

const invitationLabels: Record<string, string> = {
  issue_invitation: "Customer invitation queued",
  resend_invitation: "Customer invitation replaced",
  revoke_invitation: "Customer invitation withdrawn",
}

export function OnboardingPanel({ view, enquiryId, open, businessName, country, dispatchEnabled = false, invitationMail = null }: {
  view: OnboardingView
  enquiryId: string
  open: boolean
  businessName: string
  country: string
  dispatchEnabled?: boolean
  invitationMail?: InvitationMail | null
}) {
  const [offerSummary, setOfferSummary] = useState("Choose an approved version to see the offer total.")
  if (!view.supported) return null
  const request = view.request
  const version = request?.version ?? 0
  const stepIndex = { classify: 0, customer: 1, business: 2, locations: 3, next: 4 }[view.step]
  const plans = view.approvedPlans ?? []
  const offerable = plans.filter(plan => plan.offerable)
  const guardChoices = view.locations.filter(location => location.selected)
  function refreshOffer(form: HTMLFormElement) {
    const data = new FormData(form)
    const selected = offerable.find(plan => plan.id === String(data.get("planVersionId") ?? ""))
    if (!selected) {
      setOfferSummary("Choose an approved version to see the offer total.")
      return
    }
    const base = selected.amountMinor
    if (base === null) {
      setOfferSummary("Choose an approved version to see the offer total.")
      return
    }
    const guards = selected.guardQuantity == null && selected.guardAddonUnitMinor === 999 ? data.getAll("guardLocationIds").length : 0
    const total = base + (selected.guardAddonUnitMinor ?? 0) * guards
    setOfferSummary(guards === 0
      ? `Offer total ${pounds(total)} per month for Telloya alone.`
      : `Offer total ${pounds(total)} per month. Telloya ${pounds(base)} plus Relaunch Guard ${pounds((selected.guardAddonUnitMinor ?? 0) * guards)} for ${guards} location${guards === 1 ? "" : "s"}.`)
  }
  const verifiedCopy = view.emailVerified
    ? "Customer email verified. That check is separate from Admin approval."
    : "Customer email is not verified. Admin approval does not verify it and does not send an invitation."
  const membershipCopy = view.membership === "verified"
    ? "Business authority is verified. This is separate from email verification."
    : view.membership === "revoked"
      ? "Business authority has been withdrawn."
      : view.membership === "pending"
        ? "Business authority is pending. Pending is not verified authority."
        : null
  return <section className="panel">
    <h2>Telloya and Complete onboarding</h2>
    <p>{view.nextAction || "Review the enquiry and record the next onboarding step."}</p>
    <ol>{steps.map((label, index) => <li key={label}>{index < stepIndex ? "Done" : index === stepIndex ? "Now" : "Later"} · {label}</li>)}</ol>
    {request && <p><Badge tone="neutral">{productLabels[request.product]}</Badge> · {stateLabels[request.state] || request.state}</p>}
    <p>{verifiedCopy}</p>
    {membershipCopy && <p>{membershipCopy}</p>}
    {view.requestedTier && <p>The enquiry asked for {tierLabels[view.requestedTier]}. That records interest. It is not consent to charge and it is not a subscription.</p>}
    {view.termsConfigured ? <p>An approved price is available. Preparing an offer pins the selected version. It does not take payment or activate a product.</p> : <p>Commercial terms not yet configured. No price is offered.</p>}
    {!dispatchEnabled && <p>No invitation email is sent from this screen.</p>}
    {dispatchEnabled && !view.invitationReady && <p>No invitation email is sent until this request is ready.</p>}
    {view.outstanding.length > 0 && <ul>{view.outstanding.map(item => <li key={item}>{item}</li>)}</ul>}
    {view.step === "classify" && request?.state === "DECLINED" && <p>This enquiry was declined. {request.declineReason}</p>}
    {view.step === "classify" && open && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Open onboarding" payload={form => ({ operation: "classify", version: 0, enquiryId, product: form.get("product"), reason: form.get("reason") })}>
      <fieldset>
        <legend>Which product is this enquiry for?</legend>
        <label className="checkbox"><input type="radio" name="product" value="TELLOYA" required defaultChecked={view.productHint === "TELLOYA"} />Telloya</label>
        <label className="checkbox"><input type="radio" name="product" value="COMPLETE" required defaultChecked={view.productHint === "COMPLETE"} />Complete</label>
      </fieldset>
      <Reason label="Why is this Telloya or Complete?" />
    </CommandForm>}
    {view.step === "classify" && !open && <p>This enquiry is not open, so onboarding is not started.</p>}
    {view.step === "customer" && request?.state === "RECEIVED" && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Record the review" payload={form => ({ operation: "review", version, enquiryId, reason: form.get("reason") })}>
      <p>Record that an administrator has started reviewing this enquiry. This does not verify the email.</p>
      <Reason label="What did you review?" />
    </CommandForm>}
    {view.step === "customer" && view.candidates.map(candidate => <CommandForm key={candidate.id} endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel={`Use ${candidate.name || "this customer"}`} payload={form => ({ operation: "match_customer", version, enquiryId, customerId: candidate.id, reason: form.get("reason") })}>
      <p>{candidate.name || "Unnamed customer"} · {candidate.emailVerified ? "Email verified" : "Email not verified"}</p>
      <Reason label="Why is this the right customer?" />
    </CommandForm>)}
    {view.step === "customer" && view.candidates.length === 0 && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Create the customer from this enquiry" payload={form => ({ operation: "match_customer", version, enquiryId, create: true, reason: form.get("reason") })}>
      <p>No customer uses this email yet. Creating the record does not verify the email and does not send a message.</p>
      <Reason label="Why is a new customer record needed?" />
    </CommandForm>}
    {view.step === "business" && view.businesses.map(business => business.membership === "revoked"
      ? <p key={business.id}>{business.name} · Authority withdrawn. Matching does not restore it. Changing authority uses the membership record.</p>
      : <CommandForm key={business.id} endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel={`Use ${business.name || "this business"}`} payload={form => ({ operation: "match_business", version, enquiryId, businessId: business.id, membership: business.membership === "verified" ? "verified" : "pending", reason: form.get("reason") })}>
        <p>{business.name} · {business.membership === "verified" ? "Authority verified" : "Authority pending"}</p>
        <p>Matching keeps this authority. It does not verify pending authority or change verified authority.</p>
        <Reason label="Why is this the right business?" />
      </CommandForm>)}
    {view.step === "business" && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Create this business" payload={form => ({ operation: "match_business", version, enquiryId, create: true, name: form.get("name"), website: form.get("website") || "", membership: form.get("membership"), reason: form.get("reason") })}>
      <p>Create a business only when it does not already exist. Pending authority is not verified authority. Verified authority needs existing email or phone proof and a recent Admin sign-in.</p>
      <label>Business name<input name="name" required maxLength={200} defaultValue={businessName} /></label>
      <label>Website (optional)<input name="website" type="url" maxLength={2048} defaultValue="" /></label>
      <label>Authority<select name="membership" defaultValue="pending"><option value="pending">Pending. This is not verified authority.</option>{view.contactVerified && <option value="verified">Verified. Email or phone proof already exists.</option>}</select></label>
      <Reason label="Why is a new business record needed?" />
    </CommandForm>}
    {view.step === "locations" && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Save locations" payload={form => ({ operation: "select_locations", version, enquiryId, locationIds: form.getAll("location"), create: form.get("createLocation") === "on" ? true : undefined, locationName: form.get("locationName") || "", country: form.get("country") || "", reason: form.get("reason") })}>
      {view.locations.map(location => <label key={location.id} className="checkbox"><input type="checkbox" name="location" value={location.id} defaultChecked={location.selected} />{location.name} · {location.country}</label>)}
      <label className="checkbox"><input type="checkbox" name="createLocation" />Add a location for this business</label>
      <label>Location name<input name="locationName" maxLength={200} /></label>
      <label>Country<input name="country" maxLength={100} defaultValue={country} /></label>
      <Reason label="Which locations should this product cover?" />
    </CommandForm>}
    {view.step === "next" && <>
      {view.customer && <p>Customer: {view.customer.name}</p>}
      {request?.subscriptionId && <p>The customer, business, locations and commercial terms are fixed for this offer. No payment has been taken and no product is active.</p>}
      {!view.invitationReady && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Mark ready for a later invitation" payload={form => ({ operation: "mark_ready", version, enquiryId, reason: form.get("reason") })}>
        <p>This records that the matched customer, business and locations are ready for a later invitation. It does not send email, create a login, or verify an address.</p>
        <Reason label="Why is this ready for a later invitation?" />
      </CommandForm>}
      {view.invitationReady && !dispatchEnabled && <p>{view.emailVerified ? "Admin has recorded this request as ready for a later invitation. The customer email is already verified, so the existing login remains available. No invitation email has been sent." : "Admin has recorded this request as ready for a later invitation. The customer email is not verified. No invitation email has been sent."}</p>}
      {view.invitationReady && dispatchEnabled && view.emailVerified && <p>Admin has recorded this request as ready. The customer email is already verified, so the existing login remains available. No invitation email is sent.</p>}
      {view.invitationReady && dispatchEnabled && !view.emailVerified && invitationMail && <>
        <p>{invitationMail.detail}</p>
        {invitationMail.canSend && <CommandForm endpoint="invitation" actionUrl="/api/enquiries/invitation" submitLabel="Send customer invitation" payload={form => ({ operation: "issue_invitation", version, enquiryId, reason: form.get("reason") })}>
          <p>This queues one invitation to the Customer Portal. It does not verify the email, confirm business authority, take a payment, or activate Telloya or Guard. Queued is not delivered.</p>
          <Reason label="Why is this invitation being sent?" />
        </CommandForm>}
        {invitationMail.canProcess && <CommandForm endpoint="invitation" actionUrl="/api/enquiries/invitation" submitLabel="Process queued invitation now" payload={form => ({ operation: "process_invitation", version, enquiryId, reason: form.get("reason") })}>
          <p>This sends the invitation that is already queued. It does not create another invitation or another link. Queued is not delivered until the provider accepts it.</p>
          <Reason label="Why is this queued invitation being sent now?" />
        </CommandForm>}
        {invitationMail.canResend && <CommandForm endpoint="invitation" actionUrl="/api/enquiries/invitation" submitLabel="Send a new invitation" payload={form => ({ operation: "resend_invitation", version, enquiryId, reason: form.get("reason") })}>
          <p>This withdraws the current invitation and queues a replacement. The previous link stops working. It does not verify the email or activate a product.</p>
          <Reason label="Why is a new invitation needed?" />
        </CommandForm>}
        {invitationMail.canRevoke && <CommandForm endpoint="invitation" actionUrl="/api/enquiries/invitation" submitLabel="Withdraw the invitation" payload={form => ({ operation: "revoke_invitation", version, enquiryId, reason: form.get("reason") })}>
          <p>The current link stops working. This does not delete the customer or the business.</p>
          <Reason label="Why is this invitation being withdrawn?" />
        </CommandForm>}
      </>}
      {view.termsConfigured && view.membership === "verified" && !request?.subscriptionId && plans.length > 0 && <>
        {view.requestedGuardInterest === true && <p>The enquiry recorded interest in Relaunch Guard{view.requestedGuardLocationCount ? ` for ${view.requestedGuardLocationCount} locations` : ""}. That interest is not a purchase.</p>}
        {plans.some(plan => !plan.offerable) && <ul>{plans.filter(plan => !plan.offerable).map(plan => <li key={plan.id}>{plan.tierLabel || `Version ${plan.versionNumber}`}: {unavailableReasons[plan.unavailableReason ?? ""] ?? "This version cannot be offered."}</li>)}</ul>}
        {offerable.length > 0 && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Prepare the selected offer" payload={form => {
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
            {request?.product === "TELLOYA" && offerable.some(plan => plan.guardAddonUnitMinor === 999) && guardChoices.length > 0 && <>
              <p>Tick a location to include it in Relaunch Guard at £9.99 per month. Leave every box unticked to offer Telloya alone. The enquiry does not choose these locations.</p>
              {guardChoices.map(location => <label key={location.id} className="checkbox"><input type="checkbox" name="guardLocationIds" value={location.id} />Include {location.name} in Relaunch Guard</label>)}
            </>}
          </fieldset>
          <p>{offerSummary}</p>
          <p>The selected version is pinned. A different tier can be chosen when the customer has agreed to it. The enquiry tier is not changed. Guard locations are confirmed separately from the Telloya locations. The customer accepts the exact total before payment. Preparing the offer does not open a checkout or activate Telloya or Guard.</p>
          <Reason label="Why is this offer being prepared?" />
        </CommandForm>}
        {offerable.length === 0 && <p>No approved version can be offered for the selected locations. Quotation required.</p>}
      </>}
      {view.termsConfigured && view.membership === "verified" && !request?.subscriptionId && plans.length === 0 && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Prepare the approved offer" payload={form => ({ operation: "prepare_offer", version, enquiryId, reason: form.get("reason") })}>
        <p>This pins the approved price and each component’s approved quantity. Telloya and Guard are not given the same quantity. It does not open a checkout or activate Telloya or Guard.</p>
        <Reason label="Why is this offer being prepared?" />
      </CommandForm>}
    </>}
    {request && request.state !== "DECLINED" && request.state !== "CLOSED" && <details>
      <summary>Decline this onboarding request</summary>
      <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Decline onboarding" payload={form => ({ operation: "decline", version, enquiryId, reason: form.get("reason") })}>
        <p>Declining stops this request. A prepared offer is withdrawn in the same step and does not stay open. It does not delete the customer or the business, and it does not send email or take payment.</p>
        <Reason label="Why is this request declined?" />
      </CommandForm>
    </details>}
    <h3>What has been recorded</h3>
    {view.history.length === 0 ? <p>Nothing has been recorded yet.</p> : <ol className="history-list">{view.history.map(event => <li key={event.id}><Badge tone="neutral">{operationLabels[event.operation] || invitationLabels[event.operation] || "Recorded"}</Badge> · {stateLabels[event.toState] || event.toState} · {ukDate(event.createdAt)}{event.reason && <p className="preserve-lines">{event.reason}</p>}</li>)}</ol>}
  </section>
}
