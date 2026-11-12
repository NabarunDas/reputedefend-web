"use client"
import { CommandForm } from "../records/forms"

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
    }

export function TelloyaOfferActions({ offer }: { offer: TelloyaOfferPanel }) {
  if (offer.availability === "closed") return null
  if (offer.availability === "unavailable") return <p>This deployment does not have the commercial offer command. Nothing was saved.</p>
  if (offer.availability === "no_offer") return <p>No commercial offer is linked to this enquiry yet. Prepare it from the existing onboarding record.</p>
  const open = offer.amendments.find(item => item.status === "REQUESTED")
  return <>
    <p>Commercial offer {offer.offerRef} is {offer.state}. Record version {offer.version}. This is the ProfileRelaunch subscription, not a separate Telloya price list.</p>
    {open && <>
      <p>Change request: {open.text}</p>
      <CommandForm endpoint="offer" actionUrl="/api/enquiries/offer" submitLabel="Approve revision" payload={() => ({ operation: "revision", amendmentId: open.id, expectedVersion: open.version, decision: "APPROVED" })}>
        <p>Approval replaces the open commercial offer with another version of the same approved plan and amount.</p>
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
