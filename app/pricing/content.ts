import { earlyAccessLabel, pricingGroups, pricingNote } from "@/lib/pricing"

const recovery = pricingGroups[0]
const review = pricingGroups[1]
const guard = pricingGroups[2]
const guidedRecovery = recovery.items[0]
const managedRecovery = recovery.items[1]
const guidedReview = review.items[0]
const managedReview = review.items[1]
const guardPlan = guard.items[0]

export const pricingHelpHref = "/get-help"
export const pricingHowHref = "/how-it-works"
export const pricingRecoveryHref = "/get-help?service=profile-recovery"
export const pricingReviewHref = "/get-help?service=review"

export const pricingSeo = {
  titlePage: "Pricing — Google Business Profile Recovery & Review Support",
  description:
    "Early Access pricing for Google Business Profile recovery, Google review protection and Relaunch Guard. Start with an assessment, then choose Guided or Managed support. Prices shown in GBP.",
} as const

export const pricingHero = {
  eyebrow: earlyAccessLabel,
  titleLines: ["Clear pricing.", "Choose how much help you want."] as const,
  lead:
    "Start with an assessment. If paid support is appropriate, choose Guided preparation or Managed case support. The price and payment trigger are clear before you proceed.",
  primaryCta: "Start your assessment",
  primaryHref: pricingHelpHref,
  secondaryCta: "See how it works",
  secondaryHref: pricingHowHref,
  supportLine: "Prices shown in GBP • Early Access pricing • Clear payment timing",
} as const

export const pricingVisual = {
  chrome: ["Commercial model", earlyAccessLabel] as const,
  assessment: {
    label: "Start here",
    title: "Assessment",
    figure: "No fee to submit",
    note: "Direction first. Paid support only if it makes sense.",
  },
  rows: [
    {
      service: "Profile Recovery",
      items: [
        { name: "Guided", figure: guidedRecovery.price, cadence: guidedRecovery.cadence },
        {
          name: "Managed",
          figure: managedRecovery.detail ?? "£0 today",
          cadence: `${managedRecovery.price} ${managedRecovery.cadence}`,
        },
      ],
    },
    {
      service: "Review Protection",
      items: [
        { name: "Guided", figure: guidedReview.price, cadence: "upfront" },
        {
          name: "Managed",
          figure: managedReview.detail ?? "£0 today",
          cadence: `${managedReview.price} ${managedReview.cadence}`,
        },
      ],
    },
  ],
  guard: {
    name: "Relaunch Guard",
    figure: `${guardPlan.price}/month/location`,
    cadence: guardPlan.name,
  },
} as const

export const pricingTrustStrip = [
  "Assessment first",
  "Guided or Managed",
  "Clear payment timing",
  "Prices shown in GBP",
] as const

export const pricingStart = {
  eyebrow: "Before paid work",
  title: "Start with the assessment. Choose paid support only if it makes sense.",
  lead:
    "You do not need to pick Guided or Managed before the case is understood. Submit the situation, receive a human review, then decide.",
  points: [
    {
      title: "You submit the situation",
      copy: "Describe what changed, what Google has told you and what you have already tried.",
    },
    {
      title: "A person reviews it",
      copy: "The assessment is direction: what the issue appears to be, and which route looks strongest.",
    },
    {
      title: "A recommended route",
      copy: "If paid support is appropriate, we explain Guided preparation or Managed case support — and the fee — before you proceed.",
    },
    {
      title: "No obligation to buy",
      copy: "One valid outcome is that no paid support is recommended yet. The assessment does not include the full paid execution package.",
    },
  ],
  hold: {
    title: "Assessment is direction",
    copy: "Guided and Managed are execution support: evidence organisation, case preparation, wording and the agreed next stage. Those start only after you choose a paid route.",
  },
} as const

export const pricingRecovery = {
  eyebrow: recovery.title,
  title: recovery.title,
  lead: "For suspension, disabled profiles, verification, access and recovery problems.",
  guided: {
    kicker: "Guided Relaunch",
    line: guidedRecovery.detail ?? "We prepare it. You submit it.",
    price: guidedRecovery.price,
    cadence: guidedRecovery.cadence,
    spoken: `${guidedRecovery.price} ${guidedRecovery.cadence}`,
    copy: "We prepare the recovery case. You make the submission through the appropriate Google route.",
    includes: [
      "Case assessment",
      "Relevant evidence organisation",
      "Recovery and appeal preparation",
      "Wording and material preparation",
      "Submission instructions",
      "You submit through the appropriate Google route",
    ],
    cta: "Start Recovery assessment",
    href: pricingRecoveryHref,
  },
  managed: {
    kicker: "Managed Relaunch",
    line: "You authorise us. We manage the case.",
    today: managedRecovery.detail ?? "£0 today",
    price: managedRecovery.price,
    cadence: managedRecovery.cadence,
    spoken: `${managedRecovery.detail ?? "£0 today"}, then ${managedRecovery.price} ${managedRecovery.cadence}`,
    copy:
      "You authorise agreed permitted case work. We organise and manage that work. Owner-only and security steps stay with you.",
    includes: [
      "The same assessment",
      "Evidence organisation",
      "Case preparation",
      "Management of agreed permitted case work",
      "You complete owner-only and security steps",
      "Success fee only on the defined successful restoration outcome under the service terms",
    ],
    cta: "Start Managed Recovery assessment",
    href: pricingRecoveryHref,
  },
} as const

export const pricingReview = {
  eyebrow: review.title,
  title: review.title,
  lead: "For suspicious, abusive or potentially policy-breaching Google reviews.",
  guided: {
    kicker: "Guided Review",
    line: "We prepare it. You submit it.",
    price: guidedReview.price,
    cadence: "upfront",
    spoken: `${guidedReview.price} upfront`,
    copy: "We prepare the review case. You submit the challenge, report or response through the appropriate Google route.",
    includes: [
      "Review assessment",
      "Policy and context analysis",
      "Evidence organisation",
      "Challenge or report preparation",
      "Submission instructions",
      "Professional response wording where appropriate",
    ],
    cta: "Start Review assessment",
    href: pricingReviewHref,
  },
  managed: {
    kicker: "Managed Review",
    line: "You authorise us. We manage the case.",
    today: managedReview.detail ?? "£0 today",
    price: managedReview.price,
    cadence: managedReview.cadence,
    spoken: `${managedReview.detail ?? "£0 today"}, then ${managedReview.price} ${managedReview.cadence}`,
    copy:
      "You authorise agreed review case work. We manage that work. Owner-only and account-specific steps remain with you. Removal is Google's decision.",
    includes: [
      "The same assessment",
      "Evidence organisation",
      "Case preparation",
      "Agreed review case management with authorisation",
      "Owner-only and account-specific steps remain with you",
      "Success fee only on the defined successful removal outcome under the service terms",
    ],
    cta: "Start Managed Review assessment",
    href: pricingReviewHref,
  },
} as const

export const pricingCompare = {
  eyebrow: "Guided or Managed",
  title: "Guided or Managed? The difference is who carries the case forward.",
  lead:
    "Both routes start with the same assessment. Guided is preparation you submit. Managed is authorised case work we carry forward. You still complete owner-only and security steps on Managed.",
  columns: ["Guided", "Managed"] as const,
  rows: [
    { label: "Assessment", guided: "Same human assessment", managed: "Same human assessment" },
    { label: "Evidence organisation", guided: "ProfileRelaunch prepares", managed: "ProfileRelaunch prepares" },
    { label: "Case and wording preparation", guided: "ProfileRelaunch prepares", managed: "ProfileRelaunch prepares" },
    { label: "Submission instructions", guided: "Included", managed: "Included, plus managed next steps" },
    { label: "Who submits", guided: "Customer submits", managed: "ProfileRelaunch manages agreed permitted work" },
    { label: "Case management", guided: "Customer carries the case forward", managed: "ProfileRelaunch manages agreed permitted case work" },
    { label: "Customer authorisation", guided: "Not required for Guided", managed: "Required before Managed work" },
    { label: "Owner-only steps", guided: "Customer completes them", managed: "Customer still completes them" },
    { label: "Payment timing", guided: "Upfront fee", managed: "£0 today" },
    { label: "Success-fee model", guided: "No success fee", managed: "Success fee on the defined successful outcome" },
  ],
  captions: {
    guided: "We prepare it. You submit it.",
    managed: "You authorise us. We manage the case.",
  },
} as const

export const pricingSuccess = {
  eyebrow: "Success-fee model",
  title: "What does “success fee” mean?",
  lead:
    "Managed is not an open-ended payment authorisation. The success fee becomes payable only when the defined successful outcome is achieved under the service terms. Google still makes the platform decision.",
  recovery: {
    title: "Managed Recovery",
    copy: `${managedRecovery.price} becomes payable only when the defined successful restoration outcome is achieved under the service terms.`,
  },
  review: {
    title: "Managed Review",
    copy: `${managedReview.price} becomes payable only when the defined successful removal outcome is achieved under the service terms.`,
  },
  notes: [
    "Google makes the platform decision on restoration, removal and similar outcomes.",
    "The detailed success definition is provided before you authorise Managed work.",
    "There is no indefinite payment authorisation.",
    "You should understand the payment trigger before proceeding.",
  ],
} as const

export const pricingTiming = {
  eyebrow: "When you pay",
  title: "Payment timing is part of the commercial model.",
  lead: "You will know the fee and the trigger before paid work starts. This page explains timing; checkout is not handled here.",
  items: [
    {
      kicker: "Guided",
      title: "Pay upfront",
      copy: `Pay ${guidedRecovery.price} or ${guidedReview.price} when you choose Guided paid preparation.`,
    },
    {
      kicker: "Managed",
      title: "£0 today",
      copy: "A success fee applies only on the defined successful outcome under the service terms. That is not a free service — it is a different payment trigger.",
    },
    {
      kicker: "Relaunch Guard",
      title: `${guardPlan.price}/month/location`,
      copy: "A recurring fee when you activate managed monitoring. It is optional and not started automatically.",
    },
  ],
  note: pricingNote,
} as const

export const pricingGuard = {
  eyebrow: guard.title,
  title: "Relaunch Guard",
  kicker: guardPlan.name,
  figure: guardPlan.price,
  cadence: "/month/location",
  spoken: `${guardPlan.price} per month, per location`,
  model: "Early Access managed monitoring.",
  lead:
    "Optional Profile + Review monitoring after the immediate case. It is managed Early Access monitoring — not a self-service dashboard, and not a claim of instant suspension detection.",
  points: [
    "Monitor relevant profile-health and status changes",
    "Monitor review activity",
    "Maintain a log of relevant monitoring activity later in the customer portal",
    "Help surface changes sooner so you can decide what to do next",
  ],
  cta: "Ask about Relaunch Guard",
  href: pricingHelpHref,
  secondaryCta: "Start your assessment",
  secondaryHref: pricingHelpHref,
} as const

export const pricingClarity = {
  eyebrow: "No surprises",
  title: "What you will know before paid work starts.",
  lead: "The commercial model is explained before you choose Guided or Managed — not after work has begun.",
  points: [
    "Which service applies",
    "Whether Guided or Managed is being chosen",
    "What work is included",
    "What you still need to do",
    "What the fee is",
    "When payment is due",
    "What counts as Managed success under the applicable service terms",
  ],
} as const

export const pricingFaqs = [
  {
    q: "Is there a fee to submit an assessment?",
    a: "No. There is no fee to submit an assessment. The assessment is direction: a human review of the situation and a recommended route. Paid Guided or Managed work starts only if you choose it after that review.",
  },
  {
    q: "When do I pay for Guided?",
    a: `Guided is an upfront fee when you choose paid preparation. Guided Relaunch is ${guidedRecovery.price} upfront. Guided Review is ${guidedReview.price} upfront.`,
  },
  {
    q: "When do I pay for Managed?",
    a: `Managed is ${managedRecovery.detail ?? "£0 today"}. The success fee becomes payable only when the defined successful outcome is achieved under the service terms. Managed Relaunch is ${managedRecovery.price} on successful restoration. Managed Review is ${managedReview.price} on successful removal.`,
  },
  {
    q: "What does successful restoration mean?",
    a: "For Managed Recovery, the success fee is tied to a defined successful restoration outcome under the service terms. The detailed definition is provided before you authorise Managed work. This page does not replace those terms, and Google still makes the platform decision.",
  },
  {
    q: "What does successful removal mean?",
    a: "For Managed Review, the success fee is tied to a defined successful removal outcome under the service terms. The detailed definition is provided before you authorise Managed work. Removal is Google's decision, not a promised result.",
  },
  {
    q: "What if Google does not reinstate my profile?",
    a: "Google makes the restoration decision. If the defined successful restoration outcome is not achieved, the Managed Recovery success fee does not become payable under the service terms. The assessment still explains the route and the limits of what can be attempted.",
  },
  {
    q: "What if Google does not remove the review?",
    a: "Google makes the removal decision. If the defined successful removal outcome is not achieved, the Managed Review success fee does not become payable under the service terms. We do not promise that a review will be removed.",
  },
  {
    q: "Do I pay if you recommend no paid support?",
    a: "No. One valid assessment outcome is that no paid support is recommended yet. You are not charged for choosing not to proceed, and the assessment itself has no submission fee.",
  },
  {
    q: "Can I switch from Guided to Managed?",
    a: "Sometimes the stronger route becomes clearer after preparation starts. If a change of service level is available, the route and any additional fee would be explained before you change. This page does not set an automatic price adjustment.",
  },
  {
    q: "Is Relaunch Guard included?",
    a: "No. Relaunch Guard is optional managed monitoring. It is not bundled automatically with Guided or Managed work, and it is not started without an explicit choice to activate it.",
  },
  {
    q: "Is Relaunch Guard a subscription?",
    a: `Yes. Relaunch Guard is ${guardPlan.price} per month, per location when activated. It is recurring managed monitoring, not a one-off case fee, and not a live self-service dashboard.`,
  },
  {
    q: "Are prices shown in GBP?",
    a: "Yes. Prices on this page are shown in GBP. Early Access pricing is the current commercial offer. Currency conversion, card fees and tax treatment are not defined on this page.",
  },
  {
    q: "Is ProfileRelaunch available outside the UK?",
    a: "Yes. ProfileRelaunch is designed for businesses internationally, subject to whether the relevant Google process or service can be supported for that case. Availability depends on the Google route involved, not on a single-country service restriction.",
  },
] as const

export const pricingFaqIntro = {
  eyebrow: "Pricing questions",
  title: "Fees, timing and what happens if Google does not change the outcome.",
  lead: "These answers cover the commercial model. Service terms supply the detailed Managed success definitions before you authorise that work.",
} as const

export const pricingClose = {
  eyebrow: "Start with the case",
  title: "Start with the case. Choose the support after you understand the route.",
  lead: "You do not need to choose £99, £59, £149 or £299 before the assessment. Begin with what happened, then decide whether Guided or Managed support is the right next step.",
  primaryCta: "Start your assessment",
  primaryHref: pricingHelpHref,
  secondaryCta: "See how it works",
  secondaryHref: pricingHowHref,
} as const
