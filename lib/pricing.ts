export const pricingLabel = "Pricing"

export const pricingIntro =
  "Clear fees for Google Business Profile recovery, review protection and monitoring."

/** Shown wherever a published price is the amount the customer pays. */
export const customerPriceLine = "Total price, inclusive of any applicable taxes."

/**
 * ProfileRelaunch does not add a further tax or mandatory fee.
 * This does not say ProfileRelaunch pays a tax a customer's own tax authority charges that customer.
 */
export const customerPriceBoundary = "No additional taxes or mandatory fees charged by ProfileRelaunch."

export const pricingNote =
  `Google makes final platform decisions. Managed success fees are payable only when the defined successful outcome is achieved under the service terms. ${customerPriceLine} ${customerPriceBoundary}`

/**
 * Customer-facing note for a stored quote or payment.
 * Internal classifications stay off this sentence. A stored inclusive amount can
 * still be shown separately as included in the total, without calling it VAT.
 * A historical exclusive row keeps the recorded total and does not claim the
 * current inclusive wording.
 */
export function customerFacingTaxNote(behaviour: string): string {
  if (behaviour === "UNCONFIRMED") return "This quote is not ready to accept."
  if (behaviour === "EXCLUSIVE") return "The total shown is the amount recorded on this quote."
  return `${customerPriceLine} ${customerPriceBoundary}`
}

export const pricingGroups = [
  {
    id: "profile-recovery",
    title: "Profile Recovery",
    items: [
      {
        name: "Guided Relaunch",
        price: "£99",
        cadence: "upfront",
        detail: "We prepare it. You submit it.",
      },
      {
        name: "Managed Relaunch",
        price: "£299",
        cadence: "on successful restoration",
        detail: "£0 today",
      },
    ],
  },
  {
    id: "review-protection",
    title: "Review Protection",
    items: [
      {
        name: "Guided Review",
        price: "£59",
        cadence: "upfront",
        detail: null,
      },
      {
        name: "Managed Review",
        price: "£149",
        cadence: "on successful removal",
        detail: "£0 today",
      },
    ],
  },
  {
    id: "relaunch-guard",
    title: "Relaunch Guard",
    items: [
      {
        name: "Profile + Review monitoring",
        price: "£9.99",
        cadence: "per month, per location",
        detail: null,
      },
    ],
  },
] as const
