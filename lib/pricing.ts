export const earlyAccessLabel = "Early Access pricing"

export const pricingIntro =
  "Clear fees for Google Business Profile recovery, review protection and monitoring."

export const pricingNote =
  "Google makes final platform decisions. Managed success fees are payable only when the defined successful outcome is achieved under the service terms."

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
