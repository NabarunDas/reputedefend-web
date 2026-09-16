import { guardOffer, guardPrice } from "@/lib/guard-offer"

export const guardSeo = {
  titlePage: "Relaunch Guard | Google Business Profile Monitoring",
  description:
    "Twice-daily Google Business Profile and review checks, with email alerts when something needs attention. Explore Relaunch Guard monitoring.",
  canonical: "/relaunch-guard",
} as const

export const guardHero = {
  eyebrow: "Relaunch Guard",
  title: "Keep an eye on your Google Business Profile.",
  lead: "We check your profile and reviews twice a day. If we spot a concerning change, we’ll review it and email you with what we found and what to do next.",
  price: `${guardPrice} per month, per location`,
  priceLabel: "Introductory pricing",
  supporting: "You don’t need an existing problem to use Guard. Start with monitoring, or add it after recovery.",
  secondaryCta: "How monitoring works",
  secondaryHref: "#how-monitoring-works",
} as const

export const guardCoverage = {
  title: "What we check",
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
} as const

export const guardSchedule = {
  title: "Morning and evening. Every day.",
  body: "We check twice a day, UK time, including weekends and bank holidays. During Early Access, these checks are carried out manually.",
  followUp: "If we find something concerning, we review it and email you with the details and our recommended next step.",
  supporting: "Checks are scheduled, not continuous. Changes can happen between checks.",
} as const

export const guardSetup = {
  id: "how-monitoring-works",
  title: "How monitoring starts",
  steps: [
    {
      title: "Tell us about your business",
      text: "Send your profile link and tell us how many locations you’d like monitored.",
    },
    {
      title: "Give us permission",
      text: "We explain the monitoring scope and ask you to add us as a Manager of the relevant Business Profile. You keep ownership.",
    },
    {
      title: "We check access",
      text: "We confirm access and complete an initial check. For multiple locations, we confirm each profile and the total monthly price.",
    },
    {
      title: "Confirm payment and start",
      text: "Once setup is ready, you complete payment. We then confirm when your monitoring starts.",
    },
  ],
  security:
    "You never need to share your Google password or verification codes. Manager access allows changes, but Guard checks and alerts by default. Changes to your profile require separate approval.",
} as const

export const guardIntervention = {
  title: "If something needs more work",
  body: "Guard includes an explanation of what we found and what we recommend next. Recovery work and review challenges are separate services. We’ll explain the work and the fee before you decide.",
  links: [
    { label: "Profile Recovery", href: "/business-profile-recovery" },
    { label: "Review Protection", href: "/review-protection" },
  ],
  benefitTitle: `${guardOffer.managedDiscountPercent}% off eligible Managed support`,
  benefitBody: `Paid Guard members receive ${guardOffer.managedDiscountPercent}% off our standard Managed Profile Recovery and Managed Review Protection fees for eligible new issues.`,
  disclosureSummary: "Which issues qualify?",
  disclosure: [
    "The issue must arise while paid Guard monitoring is active for the affected location. Problems that already existed when monitoring started are excluded.",
    "The discount does not apply to Guided support, Guard subscription fees or custom and bulk quotations. It cannot be combined with another offer.",
    "Once we agree a discounted fee for a case, cancelling Guard does not remove that discount. Managed fees still depend on the successful outcome agreed for that case.",
  ],
} as const

export const guardIncluded = {
  title: "Keep watch after recovery",
  body: `After successful Managed Profile Recovery, you can choose ${guardOffer.includedRecoveryDays} days of Guard for the restored location at no extra charge.`,
  followUp: `The ${guardOffer.includedRecoveryDays} days start when monitoring is activated. We’ll remind you before the period ends. Continuing at ${guardPrice} per month is your choice; we won’t automatically start charging you.`,
  supporting: "The paid-member discount does not apply during this included period.",
} as const

export const guardFaqTitle = "Before you start"

export const guardFaqs = [
  {
    q: "Can I subscribe if nothing is wrong?",
    a: ["Yes. Guard is available on its own. You don’t need to have used our recovery or review services."],
  },
  {
    q: "Is monitoring automated?",
    a: [
      "During Early Access, checks are manual. We plan to add supported Google integrations after approval and testing. There is no confirmed date for that change.",
    ],
  },
  {
    q: "Can Guard prevent a suspension or remove a review?",
    a: [
      "No. Guard helps you notice and understand changes. It cannot prevent Google from suspending a profile or guarantee that a review will be removed.",
    ],
  },
  {
    q: "What access do you need?",
    a: [
      "We ask you to add us as a Manager of the Business Profile you want monitored. You remain the owner. We do not need access to your Gmail or your Google password.",
    ],
  },
  {
    q: "Can you monitor several locations?",
    a: [
      "Yes. The price is per Business Profile/location. Tell us how many you need during setup, and we’ll confirm the profiles and total monthly cost before payment.",
    ],
  },
  {
    q: "When do I pay?",
    a: [
      "After we confirm access and complete the initial check. Sending the setup form does not take payment or activate monitoring.",
    ],
  },
  {
    q: "What happens if you can’t complete a check?",
    a: [
      "We retry and record the interruption. If a scheduled check remains incomplete, we let you know. If access is lost, we ask you to restore it and pause billing for unavailable coverage.",
    ],
  },
  {
    q: "What if an email cannot reach me?",
    a: [
      "If you provided a phone number, we can try calling you to resolve the contact problem. We verify any replacement email address before updating it. If no working alert channel remains, we pause the service and billing.",
    ],
  },
  {
    q: "How do I cancel?",
    a: [
      "Contact us to cancel. There is no cancellation fee. Normally, monitoring continues until the end of your paid month and does not renew. If you ask us to stop immediately, we return the unused portion of that month.",
      "A separately agreed recovery or review case continues under its own terms.",
    ],
    contactLink: true,
  },
  {
    q: "Can the introductory price change?",
    a: [
      "Yes. We give you at least 30 days’ notice of the new price and the renewal date it would apply from. We ask you to accept the change before charging the higher price. If you don’t accept, your subscription ends before that renewal.",
    ],
  },
] as const

export const guardClose = {
  title: "Set up monitoring for your business",
  body: "Tell us which profile you’d like us to keep an eye on.",
  supporting: "Already dealing with a profile or review problem?",
  assessmentLabel: "Start an assessment",
  assessmentHref: "/get-help",
} as const
