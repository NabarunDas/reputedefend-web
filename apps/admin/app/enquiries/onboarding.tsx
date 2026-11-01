"use client"
import { CommandForm, Reason } from "../records/forms"
import { Badge } from "../ui"
import { ukDate } from "@/lib/admin/activity"
import { operationLabels, productLabels, stateLabels, type OnboardingView } from "@/lib/commercial/onboarding"

const steps = ["Product", "Customer", "Business", "Locations", "Next action"] as const

export function OnboardingPanel({ view, enquiryId, open, businessName, country }: {
  view: OnboardingView
  enquiryId: string
  open: boolean
  businessName: string
  country: string
}) {
  if (!view.supported) return null
  const request = view.request
  const version = request?.version ?? 0
  const stepIndex = { classify: 0, customer: 1, business: 2, locations: 3, next: 4 }[view.step]
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
    {view.termsConfigured ? <p>An approved price is available. Preparing an offer pins that price. It does not take payment or activate a product.</p> : <p>Commercial terms not yet configured. No price is offered.</p>}
    <p>No invitation email is sent from this screen.</p>
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
    {view.step === "business" && view.businesses.map(business => <CommandForm key={business.id} endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel={`Use ${business.name || "this business"}`} payload={form => ({ operation: "match_business", version, enquiryId, businessId: business.id, membership: form.get("membership"), reason: form.get("reason") })}>
      <p>{business.name} · {business.membership === "verified" ? "Authority verified" : business.membership === "revoked" ? "Authority withdrawn" : "Authority pending"}</p>
      <label>Authority<select name="membership" defaultValue={business.membership === "verified" ? "verified" : "pending"}><option value="pending">Pending. This is not verified authority.</option>{view.contactVerified && business.membership !== "revoked" && <option value="verified">Verified. Email or phone proof already exists.</option>}</select></label>
      <Reason label="Why is this the right business?" />
    </CommandForm>)}
    {view.step === "business" && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Create this business" payload={form => ({ operation: "match_business", version, enquiryId, create: true, name: form.get("name"), website: form.get("website") || "", membership: form.get("membership"), reason: form.get("reason") })}>
      <p>Create a business only when it does not already exist. Pending authority is not verified authority.</p>
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
      {request?.subscriptionId && <p>An offer is pinned to the approved plan. No payment has been taken and no product is active.</p>}
      {!view.invitationReady && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Mark ready for a later invitation" payload={form => ({ operation: "mark_ready", version, enquiryId, reason: form.get("reason") })}>
        <p>This records that the matched customer, business and locations are ready for a later invitation. It does not send email, create a login, or verify an address.</p>
        <Reason label="Why is this ready for a later invitation?" />
      </CommandForm>}
      {view.invitationReady && <p>{view.emailVerified ? "Admin has recorded this request as ready for a later invitation. The customer email is already verified, so the existing login remains available. No invitation email has been sent." : "Admin has recorded this request as ready for a later invitation. The customer email is not verified. No invitation email has been sent."}</p>}
      {view.termsConfigured && view.membership === "verified" && !request?.subscriptionId && <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Prepare the approved offer" payload={form => ({ operation: "prepare_offer", version, enquiryId, reason: form.get("reason") })}>
        <p>This pins the approved price, terms and location quantity. It does not open a checkout or activate Telloya or Guard.</p>
        <Reason label="Why is this offer being prepared?" />
      </CommandForm>}
    </>}
    {request && request.state !== "DECLINED" && request.state !== "CLOSED" && <details>
      <summary>Decline this onboarding request</summary>
      <CommandForm endpoint="onboarding" actionUrl="/api/enquiries/onboarding" submitLabel="Decline onboarding" payload={form => ({ operation: "decline", version, enquiryId, reason: form.get("reason") })}>
        <p>Declining stops this request. It does not delete the customer or the business, and it does not send email.</p>
        <Reason label="Why is this request declined?" />
      </CommandForm>
    </details>}
    <h3>What has been recorded</h3>
    {view.history.length === 0 ? <p>Nothing has been recorded yet.</p> : <ol className="history-list">{view.history.map(event => <li key={event.id}><Badge tone="neutral">{operationLabels[event.operation] || "Recorded"}</Badge> · {stateLabels[event.toState] || event.toState} · {ukDate(event.createdAt)}{event.reason && <p className="preserve-lines">{event.reason}</p>}</li>)}</ol>}
  </section>
}
