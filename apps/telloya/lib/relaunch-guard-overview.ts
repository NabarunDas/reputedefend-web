import { commercialCopy, formatGbpPrice, relaunchGuardAddon } from "./pricing"

const authoritativeGuardUrl = relaunchGuardAddon.infoUrl

export const relaunchGuardOverview = {
  seo: {
    title: "Relaunch Guard",
    description:
      "Relaunch Guard is ProfileRelaunch's optional Google Business Profile monitoring service. Manual morning and evening checks, human-reviewed email guidance, and a separate monthly fee per paid Guard location.",
  },
  hero: {
    eyebrow: "Optional ProfileRelaunch service",
    title: "Relaunch Guard",
    lead: "Telloya answers missed calls. Relaunch Guard is a separate ProfileRelaunch service that checks a Google Business Profile. It is optional for Telloya customers.",
  },
  difference: {
    title: "Two different services",
    telloya: {
      title: "Telloya",
      text: "Telloya is a missed-call AI receptionist. It is designed to answer eligible forwarded calls, collect the enquiry, and send a lead summary.",
    },
    guard: {
      title: "Relaunch Guard",
      text: "Relaunch Guard monitors a Google Business Profile. It checks the profile and reviews, then emails guidance when a person has reviewed a concerning change.",
    },
  },
  checks: {
    title: "What Guard checks",
    cards: [
      {
        title: "Your profile",
        text: "We check whether your profile is available and review the status information we can access.",
      },
      {
        title: "Your business details",
        text: "We look for changes to key details, including your business name, address or service area, opening hours and contact information.",
      },
      {
        title: "Your reviews",
        text: "We check for new or changed reviews and look more closely at anything that may need your attention.",
      },
    ],
    note: "We compare what we can see with the starting details agreed during setup. We may not see every change, and a missing listing does not automatically mean Google has suspended it.",
  },
  schedule: {
    title: "Morning and evening. Every day.",
    body: "Our team checks your profile and reviews each morning and evening, UK time, including weekends and bank holidays. These checks are carried out manually.",
    followUp: "If we find something concerning, we review it and email you with the details and our recommended next step.",
    supporting: "Checks are scheduled, not continuous. Changes can happen between checks.",
  },
  access: {
    title: "Manager access, without your Google password",
    body: "You never need to share your Google password or verification codes. We ask you to add us as a Manager of the Business Profile you want monitored. You remain the owner. We do not need access to your Gmail.",
    boundary: "Manager access allows changes, but Guard checks and alerts by default. Changes to your profile require separate approval.",
  },
  price: {
    title: "A separate monthly fee",
    amount: `${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} per paid Guard location per month`,
    independence: "Guard is its own subscription. It can be added to a Telloya plan, and it can also be arranged on its own with ProfileRelaunch.",
    entitlement: commercialCopy.guardOnly,
    interest: "Selecting Guard on a Telloya enquiry records interest only. It is not a Guard purchase and it does not start monitoring.",
  },
  limits: {
    title: "What Guard does not do",
    items: [
      "Checks are scheduled, not continuous. Changes can happen between checks.",
      "Guard cannot prevent Google from suspending a profile.",
      "Guard cannot guarantee that a review will be removed.",
      "Recovery work and review challenges are separate services. The work and the fee are explained before you decide.",
    ],
  },
  authority: {
    title: "Full commercial details stay with ProfileRelaunch",
    body: "Eligibility, the paid-member discount, cancellation arrangements and the full questions are explained on the ProfileRelaunch Guard page.",
  },
  actions: {
    enquireLabel: "Enquire about Telloya + Guard",
    enquireHref: "/enquire?product=complete",
    enquireNote: "This enquiry is for Telloya with optional Guard interest. It does not buy Guard on its own. A Guard-only subscription is arranged with ProfileRelaunch.",
    externalLabel: "View full details on ProfileRelaunch",
    externalHref: authoritativeGuardUrl,
  },
} as const
