"use client"
import { formatGbpPence } from "@/lib/commercial/telloya-offer"
import { CommandForm } from "../records/forms"

export type TelloyaOfferPlan = { id: string; tier: string; label: string; amountMinor: number; includedMinutes: number | null; locationCap: number }
export type TelloyaOfferLocation = { id: string; name: string; selected: boolean }

export type TelloyaOfferPanel =
  | { availability: "closed" }
  | { availability: "unavailable" }
  | { availability: "no_offer" }
  | {
      availability: "ready"
      subscriptionId: string
      offerRef: string
      state: string
      version: number
      amendments: { id: string; status: string; version: number; text: string }[]
      planVersionId?: string
      amountMinor?: number
      tier?: string | null
      enquiryRef?: string | null
      plans?: TelloyaOfferPlan[]
      locations?: TelloyaOfferLocation[]
      paymentStatus?: "none" | "verifying" | "paid"
    }

export function TelloyaOfferActions({ offer }: { offer: TelloyaOfferPanel }) {
  if (offer.availability === "closed") return null
  if (offer.availability === "unavailable") return <p>This deployment does not have the commercial offer command. Nothing was saved.</p>
  if (offer.availability === "no_offer") return <p>No commercial offer is linked to this enquiry yet. Prepare it from the existing onboarding record.</p>
  const open = offer.amendments.find(item => item.status === "REQUESTED")
  const plans = offer.plans ?? []
  const locations = offer.locations ?? []
  return <>
    <p>Commercial offer {offer.offerRef} is {offer.state}. Record version {offer.version}. {offer.enquiryRef ? `Enquiry ${offer.enquiryRef}. ` : ""}This is the ProfileRelaunch subscription, not a separate Telloya price list.</p>
    {offer.amountMinor !== undefined && <p>Current monthly total {formatGbpPence(offer.amountMinor)}{offer.tier ? ` on ${offer.tier}` : ""}.</p>}
    {open && <>
      <p>Change request: {open.text}</p>
      {plans.length > 0 && <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Issue revised offer" payload={form => ({
        operation: "revision",
        amendmentId: open.id,
        expectedVersion: open.version,
        decision: "REVISED",
        planVersionId: form.get("planVersionId"),
        guardLocationIds: form.getAll("guardLocationId"),
      })}>
        <label>Approved plan<select name="planVersionId" defaultValue={offer.planVersionId} required>
          {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.label} · {formatGbpPence(plan.amountMinor)}{plan.includedMinutes === null ? " · quoted minutes" : ` · ${plan.includedMinutes} minutes`}</option>)}
        </select></label>
        {locations.map(location => <label key={location.id} className="checkbox"><input type="checkbox" name="guardLocationId" value={location.id} defaultChecked={location.selected} />{location.name || "Unnamed location"}</label>)}
        <p>A revised offer is created only when the plan or the confirmed Guard locations change. The monthly total is recalculated from the approved plan. An unchanged copy is not issued.</p>
      </CommandForm>}
      <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Record configuration request" payload={() => ({ operation: "revision", amendmentId: open.id, expectedVersion: open.version, decision: "NOTED" })}>
        <p>Use this for a greeting or receptionist request that does not change the plan, Guard locations, or price. The open offer stays as it is.</p>
      </CommandForm>
      <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Decline request" payload={() => ({ operation: "revision", amendmentId: open.id, expectedVersion: open.version, decision: "DECLINED" })}>
        <p>Declining leaves the current offer unchanged.</p>
      </CommandForm>
    </>}
    {offer.state === "OFFERED" && <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Queue offer email" payload={() => ({ operation: "mail", subscriptionId: offer.subscriptionId, expectedVersion: offer.version })}>
      <p>Queueing uses the shared email outbox. It does not mark the message accepted or delivered.</p>
    </CommandForm>}
  </>
}
