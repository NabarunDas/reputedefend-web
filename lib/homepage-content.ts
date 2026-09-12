import { brandDescriptor, brandName } from "@/lib/brand"
import { earlyAccessLabel, pricingGroups, pricingNote } from "@/lib/pricing"

const profileRecovery = pricingGroups[0]
const reviewProtection = pricingGroups[1]
const relaunchGuard = pricingGroups[2]
const guidedRelaunch = profileRecovery.items[0]
const managedRelaunch = profileRecovery.items[1]
const guidedReview = reviewProtection.items[0]
const managedReview = reviewProtection.items[1]
const guardPlan = relaunchGuard.items[0]

export const homepageSeo = {
  titlePage: "Google Business Profile Recovery & Review Protection",
  description:
    "Google Business Profile recovery and review protection for UK businesses. Human-reviewed help when a profile is suspended, inaccessible or stuck — or a suspicious review is damaging trust.",
} as const

export const homepageHero = {
  eyebrow: brandDescriptor,
  titleLines: ["Restore your Google visibility.", "Protect your reputation."] as const,
  lead:
    "When your Google Business Profile is suspended, inaccessible or stuck — or a suspicious review is damaging trust — ProfileRelaunch helps you understand the issue, prepare the right evidence and take the strongest appropriate next step.",
  primaryCta: "Start your assessment",
  primaryHref: "/get-help",
  secondaryCta: "View how it works",
  secondaryHref: "/how-it-works",
  supportLine: "Human-reviewed • Evidence-led • Clear next steps",
} as const

export const homepageTrustStrip = [
  "Human-reviewed cases",
  "Evidence-led assessment",
  "Guided or Managed support",
  "UK-based independent service",
] as const

export const homepageProblems = {
  eyebrow: "Problem recognition",
  title: "Has your Google presence suddenly changed?",
  lead:
    "These are the situations we assess. You do not need a diagnosis before you contact us — only a clear account of what changed.",
  items: [
    "Profile suspended or disabled",
    "Verification stuck or rejected",
    "Lost access to the profile",
    "Profile disappeared from Google",
    "Suspicious or policy-breaching review",
    "Previous appeal or challenge unsuccessful",
  ],
  unsure: "Not sure which applies?",
  cta: "Start your assessment",
} as const

export const homepageServices = {
  eyebrow: "What we do",
  title: "Two specialist services. One goal: protect how customers find and trust your business.",
  lead:
    "Profile Recovery and Review Protection are different problems with different evidence and routes. The assessment is there to identify which applies — and what not to do next.",
  profile: {
    kicker: "Service 01",
    title: "Profile Recovery",
    href: "/business-profile-recovery",
    cta: "Explore Profile Recovery",
    lead:
      "For suspensions, lost access, failed or stuck verification, and profiles that have disappeared from Google. We establish what changed, gather the evidence that actually matters, and prepare the reinstatement or recovery route that fits.",
    points: [
      "Suspension, disablement and access issues",
      "Verification stuck, rejected or incomplete",
      "Reinstatement and recovery preparation",
      "Evidence organised for the appeal or recovery route",
    ],
  },
  review: {
    kicker: "Service 02",
    title: "Review Protection",
    href: "/review-protection",
    cta: "Explore Review Protection",
    lead:
      "For suspicious or potentially policy-breaching reviews that are damaging trust. We assess the review and surrounding evidence, then prepare a reporting or challenge route — and a professional response where that is the stronger step.",
    points: [
      "Suspicious or potentially policy-breaching reviews",
      "Evidence assessment against Google's review policies",
      "Reporting or challenge route prepared with context",
      "Professional public response where that is appropriate",
    ],
    limit:
      "Google decides whether a review is removed. Ordinary negative feedback is not automatically a policy issue.",
  },
} as const

export const homepageProcess = {
  eyebrow: "How it works",
  title: "A short, clear path from what happened to how you proceed.",
  lead:
    "You can attempt Google's process yourself. Paying for support is about reducing confusion: understanding what actually happened, avoiding unnecessary profile changes, presenting relevant evidence clearly, and choosing the correct route rather than repeating unsupported attempts.",
  moreHref: "/how-it-works",
  moreCta: "See exactly how it works",
  steps: [
    {
      n: "01",
      title: "Tell us what happened",
      copy: "Share the issue, relevant messages or links, and anything you have already tried. You do not need a finished case file.",
    },
    {
      n: "02",
      title: "We assess the situation",
      copy: "A human reviews the facts, timeline and evidence. We identify what matters and what is likely to waste time.",
    },
    {
      n: "03",
      title: "We recommend the strongest appropriate route",
      copy: "You get a clear recommendation — recovery, reporting, response, or waiting — with the reasons, before you pay for further work.",
    },
    {
      n: "04",
      title: "Choose how you want to proceed",
      copy: "If you want help carrying the recommendation through, you choose the support model that fits.",
    },
  ],
  models: [
    {
      name: "Guided",
      line: "We prepare it. You submit it.",
      copy: "We organise the evidence and prepare what needs to be submitted. You remain the person who files it with Google.",
    },
    {
      name: "Managed",
      line: "You authorise us. We manage the case.",
      copy: "With your authorisation, we handle the case work after the assessment. You are not left to assemble and submit it alone.",
    },
  ],
} as const

export const homepagePricingPreview = {
  eyebrow: earlyAccessLabel,
  title: "Clear support. Clear pricing.",
  lead:
    "Fees are stated before you decide. Managed work is £0 today; a success fee is due only if the defined successful outcome is achieved.",
  items: [
    {
      label: profileRecovery.title,
      figure: `From ${guidedRelaunch.price}`,
      detail: `${guidedRelaunch.name} ${guidedRelaunch.cadence}.`,
    },
    {
      label: reviewProtection.title,
      figure: `From ${guidedReview.price}`,
      detail: `${guidedReview.name} ${guidedReview.cadence}.`,
    },
    {
      label: "Managed options",
      figure: managedRelaunch.detail ?? "£0 today",
      detail: "Success fee only when the defined successful outcome is achieved.",
    },
    {
      label: relaunchGuard.title,
      figure: `${guardPlan.price}/month/location`,
      detail: guardPlan.name,
    },
  ],
  note: pricingNote,
  primaryCta: "View pricing",
  primaryHref: "/pricing",
  secondaryCta: "Start your assessment",
  secondaryHref: "/get-help",
} as const

export const homepageGuard = {
  eyebrow: relaunchGuard.title,
  title: "Profile + Review monitoring, once the immediate issue is in hand.",
  lead:
    "Relaunch Guard is Profile + Review monitoring for a location. It is intended to watch for relevant changes in Google Business Profile health and review activity. It is offered as Early Access monitoring — we will confirm what is in place when you add it, and there is no self-serve dashboard yet.",
  points: [
    "Google Business Profile health and status changes",
    "Review activity on the listing",
  ],
  price: `${guardPlan.price} ${guardPlan.cadence}`,
  cta: "See Relaunch Guard on pricing",
  href: "/pricing",
} as const

export const homepageWhy = {
  eyebrow: `Why ${brandName}`,
  title: "A considered case is stronger than another unsupported attempt.",
  lead:
    "Repeated forms, unnecessary profile edits and vague accusations often add confusion. The value of support is structure: a human reading of what happened, evidence before action, and a route you can actually follow.",
  principles: [
    {
      title: "Human assessment",
      copy: "A person reviews the notice, timeline and context rather than routing you through a generic checklist.",
    },
    {
      title: "Evidence before action",
      copy: "Recommendations follow the facts available. We do not push changes that are unlikely to help.",
    },
    {
      title: "Clear recommendation",
      copy: "You should understand the suggested route, why it fits, and what Google still decides.",
    },
    {
      title: "Guided or Managed support",
      copy: "After the assessment you choose: we prepare it and you submit it, or you authorise us to manage the case.",
    },
    {
      title: "Transparent pricing",
      copy: `${earlyAccessLabel} is published. You see the fee and the model before any paid work begins.`,
    },
  ],
} as const

export const homepageFaqs = [
  {
    q: "My Business Profile has been suspended. Where should I start?",
    a: "Keep a copy of the notification, note when it appeared, and gather the profile link plus anything you have already tried. Then start an assessment. You do not need a finished case file before asking for help.",
  },
  {
    q: "Can you help if I've already submitted an appeal?",
    a: "Yes. Share what you submitted, when you submitted it and any reply you received. That helps us understand the current position before recommending a next step — including whether another attempt is likely to help.",
  },
  {
    q: "Can you remove a negative Google review?",
    a: "Google decides whether a review is removed. We can help you assess whether the content may raise a policy issue and what a response or challenge might involve. Ordinary negative feedback is not automatically a policy violation, and we do not promise removal.",
  },
  {
    q: "What is Guided vs Managed?",
    a: "Guided means we prepare it and you submit it. Managed means you authorise us and we manage the case. Both start with the same human assessment. The fee model differs: Guided is an upfront fee; Managed is £0 today, with a success fee only if the defined successful outcome is achieved.",
  },
  {
    q: `Is ${brandName} affiliated with Google?`,
    a: `No. ${brandName} is independent of Google. We help you prepare and navigate the process; we do not control platform decisions and we are not an official Google partner.`,
  },
  {
    q: "How much does support cost?",
    a: `${earlyAccessLabel}: Guided Profile Recovery is ${guidedRelaunch.price} ${guidedRelaunch.cadence}; Guided Review Protection is ${guidedReview.price} ${guidedReview.cadence}. Managed Profile Recovery is ${managedRelaunch.price} ${managedRelaunch.cadence} (${managedRelaunch.detail}); Managed Review Protection is ${managedReview.price} ${managedReview.cadence} (${managedReview.detail}). Relaunch Guard is ${guardPlan.price} ${guardPlan.cadence}. Google makes final platform decisions.`,
  },
] as const

export const homepageConversion = {
  eyebrow: "Next step",
  title: "Start with the problem. We'll help you understand the next step.",
  lead: "Tell us what happened, what changed and what you have already tried.",
  primaryCta: "Start your assessment",
  primaryHref: "/get-help",
  secondaryCta: "View pricing",
  secondaryHref: "/pricing",
  formIntro: "Or send a short note here. Use Get Help if you have a longer timeline, documents or a live case.",
  points: [
    "Submitting an enquiry does not commit you to paid support.",
    "Please do not send passwords or verification codes.",
  ],
} as const
