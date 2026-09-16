import { pricingGroups, pricingLabel, pricingNote } from "@/lib/pricing"

const recovery = pricingGroups[0]
const review = pricingGroups[1]
const guard = pricingGroups[2]
const guidedRecovery = recovery.items[0]
const managedRecovery = recovery.items[1]
const guidedReview = review.items[0]
const managedReview = review.items[1]
const guardPlan = guard.items[0]

export const howHelpHref = "/get-help"
export const howPricingHref = "/pricing"
export const howRecoveryHref = "/business-profile-recovery"
export const howReviewHref = "/review-protection"

export const howSeo = {
  titlePage: "How It Works — Google Profile Recovery & Review Process",
  description:
    "How ProfileRelaunch works: tell us what happened, receive a human assessment of your Google Business Profile or review issue, then choose Guided or Managed support. Google Connect is coming soon.",
} as const

export const howHero = {
  eyebrow: "How ProfileRelaunch works",
  titleLines: ['From “what happened?”', "to a clear next move."] as const,
  lead:
    "You do not need to diagnose the problem before you start. Tell us what changed, what Google has told you and what you have already tried. We review the situation, identify what matters and explain the strongest appropriate route before you decide whether you want paid support.",
  primaryCta: "Start your assessment",
  primaryHref: howHelpHref,
  secondaryCta: "View pricing",
  secondaryHref: howPricingHref,
  supportLine: "Human-reviewed • Evidence-led • Clear recommendation",
} as const

export const howVisual = {
  chrome: ["Case journey", "How it works"] as const,
  stages: [
    {
      label: "Start",
      items: ["Tell us what happened"],
    },
    {
      label: "Assess",
      items: ["Issue", "Timeline", "Evidence", "Previous attempts"],
    },
    {
      label: "Recommend",
      items: ["Recovery", "Challenge/report", "Professional response", "Specialist review", "No paid support yet"],
    },
    {
      label: "Choose",
      items: ["Guided", "Managed"],
    },
  ],
} as const

export const howTrustStrip = [
  "Human-reviewed assessment",
  "Evidence-led recommendation",
  "Guided or Managed if you want support",
  pricingLabel,
] as const

export const howStart = {
  eyebrow: "How you begin",
  title: "Two ways to start. One assessment process.",
  lead:
    "Both routes feed the same human review. Today you tell us what happened. A Google connection is planned for later, once a supported integration is available.",
  live: {
    status: "Available now",
    title: "Tell us what happened",
    copy:
      "Describe what changed, share links, notices or screenshots where you have them, and tell us what you have already tried. A person reviews it. This remains the live production route even after automation exists.",
    points: [
      "Describe what changed",
      "Provide links, notices or screenshots where available",
      "Explain previous attempts",
      "Human assessment",
      "Permanent route",
    ],
    cta: "Start your assessment",
    href: howHelpHref,
  },
  future: {
    status: "Coming soon",
    title: "Connect Google",
    copy:
      "A future authorised connection, intended to retrieve supported Business Profile and review information where Google permits. Customer authorisation would be required. The same assessment process would follow once information is retrieved.",
    points: [
      "Authorised connection, when supported",
      "Retrieve permitted profile or review information",
      "Customer authorisation required",
      "Same assessment process after retrieval",
    ],
    note: "Not live yet. Pending supported integration and API availability. This page does not offer a live Google connection.",
  },
} as const

export const howSend = {
  eyebrow: "What to send",
  title: "Start with what you have.",
  lead:
    "A useful assessment does not require a perfect case file. Send the picture as it stands. If something material is missing, we will say so.",
  items: [
    "A short description of what happened",
    "When the issue began",
    "Business Profile or review link",
    "Google messages or notices",
    "Relevant screenshots",
    "Previous appeal or report attempts",
    "Google's previous response, if any",
    "Relevant supporting business evidence",
  ],
  safety: "Never send passwords, OTPs, verification codes or security answers.",
  safetyNote: "Avoid unnecessary sensitive personal information. If Google requires an owner-only step, we will explain what you need to complete yourself.",
} as const

export const howAssess = {
  eyebrow: "Human assessment",
  title: "A person reviews the case before we recommend a route.",
  lead:
    "Automation may assist later. The customer promise is human QA: someone reads the situation, checks what the information actually supports, and explains a recommendation. We do not claim knowledge of private or internal Google enforcement data.",
  items: [
    { title: "What happened", body: "The event, the listing or review concerned, and how it is affecting the business." },
    { title: "Timeline", body: "When it started, what changed, and the order of notices, appeals or reports." },
    { title: "What Google has communicated", body: "The wording of messages, notices or replies you can share — not hidden internal systems." },
    { title: "Available evidence", body: "Links, screenshots, records and other material that can support or qualify the picture." },
    { title: "Previous attempts", body: "What has already been submitted, and how Google responded if a response exists." },
    { title: "Gaps and contradictions", body: "Missing facts, inconsistent records, or points that would change the recommendation." },
    { title: "The process that appears relevant", body: "Recovery, challenge, report, professional response, specialist review — or no paid support yet." },
  ],
} as const

export const howOutcomes = {
  eyebrow: "Assessment outcomes",
  title: "A recommendation category — not a score.",
  lead:
    "These are judgement labels after a human review. They are not statistical probabilities, confidence percentages or an automated ranking engine.",
  recovery: [
    {
      label: "Strong recovery fit",
      copy: "The information supports progressing with structured Profile Recovery.",
    },
    {
      label: "Moderate recovery fit",
      copy: "Recovery may be appropriate, but important evidence or clarification is still needed.",
    },
    {
      label: "Specialist review required",
      copy: "The situation is more complex and should not be pushed into a standard route yet.",
    },
    {
      label: "No paid support recommended yet",
      copy: "The available information does not currently justify paid execution support.",
    },
  ],
  reviewNote: {
    title: "For Review Protection, the recommendation may instead be:",
    items: [
      "Challenge or report route",
      "Professional response route",
      "More evidence needed",
      "No further platform action recommended yet",
    ],
  },
} as const

export const howValue = {
  eyebrow: "What the free assessment covers",
  title: "The assessment tells you the direction. Paid support prepares or manages the execution.",
  lead:
    "The first review should reduce uncertainty. It is not the Guided or Managed execution package.",
  gives: {
    title: "The assessment should give you",
    items: [
      "An initial understanding of the situation",
      "What information matters",
      "The recommended route",
      "Why that route appears appropriate",
      "What kind of paid support is available if you want it",
    ],
  },
  holds: {
    title: "It does not include, before purchase",
    items: [
      "Complete appeal wording",
      "A full evidence pack",
      "A detailed submission script",
      "A complete challenge document",
      "Field-by-field paid submission instructions",
    ],
  },
} as const

export const howChoice = {
  eyebrow: "Step 4",
  title: "Choose how you want us to help.",
  lead:
    "If paid support is appropriate and you want it, this is the commercial choice. Both options start from the same assessment. The difference is who prepares the case, who submits, and when you pay.",
  guided: {
    kicker: "Guided",
    line: "We prepare it. You submit it.",
    copy:
      "We prepare the evidence and case material, wording and instructions. You make the relevant submission through the appropriate Google route.",
    prices: [
      { service: "Profile Recovery", figure: guidedRecovery.price, cadence: guidedRecovery.cadence },
      { service: "Review Protection", figure: guidedReview.price, cadence: "upfront" },
    ],
  },
  managed: {
    kicker: "Managed",
    line: "You authorise us. We manage the case.",
    copy:
      "You authorise agreed case work. We organise and manage the permitted work. Owner-only, security and verification steps remain with you. The success fee applies only on the defined successful outcome under the service terms.",
    prices: [
      {
        service: "Profile Recovery",
        figure: managedRecovery.detail ?? "£0 today",
        cadence: `${managedRecovery.price} ${managedRecovery.cadence}`,
      },
      {
        service: "Review Protection",
        figure: managedReview.detail ?? "£0 today",
        cadence: `${managedReview.price} ${managedReview.cadence}`,
      },
    ],
  },
  note: pricingNote,
} as const

export const howAuth = {
  eyebrow: "Managed authorisation",
  title: "Managed does not mean handing over your Google password.",
  lead:
    "Authorisation is permission to carry out agreed case work. It is not unrestricted account control, and it is never a request for login secrets.",
  weMay: {
    title: "Depending on the case, Managed may involve",
    items: [
      "Customer authorisation",
      "Manager access where appropriate and supported",
      "ProfileRelaunch organising evidence",
      "ProfileRelaunch preparing case material",
      "Permitted profile or case actions",
      "Monitoring responses",
      "Helping coordinate the next step",
    ],
  },
  youKeep: {
    title: "You still perform",
    items: [
      "Password and security actions",
      "OTPs",
      "Identity and security verification",
      "Owner-only steps",
      "Anything Google requires the account owner to complete personally",
    ],
  },
  never: "We never ask for passwords, OTPs, security codes or security answers.",
} as const

export const howRecoveryPath = {
  eyebrow: "Profile Recovery path",
  title: "When the issue is the listing itself.",
  steps: [
    "Issue",
    "Assessment",
    "Recovery recommendation",
    "Guided or Managed",
    "Evidence and case preparation",
    "Submission or management",
    "Google platform decision",
  ],
  cta: "Explore Profile Recovery",
  href: howRecoveryHref,
} as const

export const howReviewPath = {
  eyebrow: "Review Protection path",
  title: "When the issue is a review.",
  steps: [
    "Review concern",
    "Evidence and context assessment",
    "Challenge/report or professional response",
    "Guided or Managed",
    "Preparation or management",
    "Google removal decision where applicable",
  ],
  cta: "Explore Review Protection",
  href: howReviewHref,
} as const

export const howPricing = {
  eyebrow: pricingLabel,
  title: "Clear fees before you choose.",
  lead: "Detailed terms live on Pricing and in the service terms. This is the commercial summary.",
  groups: [
    {
      title: recovery.title,
      items: [
        { name: "Guided", figure: guidedRecovery.price, cadence: `${guidedRecovery.cadence}. ${guidedRecovery.detail}` },
        {
          name: "Managed",
          figure: managedRecovery.detail ?? "£0 today",
          cadence: `${managedRecovery.price} ${managedRecovery.cadence}`,
        },
      ],
    },
    {
      title: review.title,
      items: [
        { name: "Guided", figure: guidedReview.price, cadence: "upfront. We prepare it. You submit it." },
        {
          name: "Managed",
          figure: managedReview.detail ?? "£0 today",
          cadence: `${managedReview.price} ${managedReview.cadence}`,
        },
      ],
    },
    {
      title: guard.title,
      items: [
        {
          name: guardPlan.name,
          figure: guardPlan.price,
          cadence: guardPlan.cadence,
        },
      ],
    },
  ],
  cta: "View full pricing",
  href: howPricingHref,
  note: pricingNote,
} as const

export const howGuard = {
  eyebrow: "Relaunch Guard",
  title: "Keep an eye on your profile, with or without a case.",
  lead:
    "You can choose monitoring for a profile that is running normally, even if you have never used our recovery or review services.",
  figure: guardPlan.price,
  cadence: guardPlan.cadence,
  model: "Our team checks your profile and reviews each morning and evening, UK time, including weekends and bank holidays. We review concerning changes and email you with the details. Checks are scheduled, not continuous.",
} as const

export const howTimeline = {
  eyebrow: "The operating process",
  title: "From the first message to Google's decision.",
  steps: [
    { n: "01", title: "Tell us what happened", body: "Share the situation, links, notices and what you have already tried." },
    { n: "02", title: "Human assessment", body: "A person reviews the issue, evidence, timeline and previous attempts." },
    { n: "03", title: "Receive the recommendation", body: "We explain the route that appears strongest, and why." },
    { n: "04", title: "Choose how you want us to help", body: "Guided: we prepare it, you submit it. Managed: you authorise us, we manage the case." },
    { n: "05", title: "Prepare or manage the case", body: "Paid support organises evidence, wording and the agreed next stage." },
    { n: "06", title: "Google makes the relevant platform decision", body: "Reinstatement, review removal and similar outcomes remain Google's to decide." },
    { n: "07", title: "Optional ongoing monitoring", body: "You can add Relaunch Guard after recovery. It is also available on its own, without a recovery or review case." },
  ],
} as const

export const howFaqs = [
  {
    q: "Do I need to know what caused the problem?",
    a: "No. Start with what happened, what changed and what Google has told you. Diagnosis is part of the assessment, not a requirement before you contact us.",
  },
  {
    q: "Do I need all my evidence before starting?",
    a: "No. Start with what you have. If something material is missing, we will explain what would help and why. A useful enquiry does not require a perfect case file.",
  },
  {
    q: "Is the assessment automated?",
    a: "No. A person reviews the case before we recommend a route. Automation may assist later, but the customer promise is human QA — not an AI score or a generic generated answer.",
  },
  {
    q: "Can I connect my Google account?",
    a: "Not yet. Connect Google is Coming Soon, pending supported integration and API availability. There is no launch date. Until then, tell us what happened — that is the live production route.",
  },
  {
    q: "Will you need my password?",
    a: "No. Never send passwords, OTPs, verification codes or security answers. Owner-only and security steps stay with you. Managed authorisation is permission for agreed case work, not a request for login secrets.",
  },
  {
    q: "What is Guided vs Managed?",
    a: "Guided means we prepare it and you submit it. Managed means you authorise us and we manage the case. Guided Profile Recovery is £99 upfront; Guided Review is £59 upfront. Managed Profile Recovery is £0 today and £299 on successful restoration; Managed Review is £0 today and £149 on successful removal.",
  },
  {
    q: "What does authorisation mean?",
    a: "Authorisation is your permission for ProfileRelaunch to carry out agreed case work. Depending on the case that may include organising evidence, preparing material, permitted actions and coordinating next steps. It does not mean handing over your Google password or unrestricted account control.",
  },
  {
    q: "Can you submit everything for me?",
    a: "No. Some Google processes can only be completed by the account owner. Even on Managed, you still perform passwords, OTPs, identity checks and any owner-only step Google requires personally.",
  },
  {
    q: "What if you don't recommend paid support?",
    a: "Then we will say so. One possible outcome is that paid execution support is not justified yet — or that a professional response, more evidence, or no further platform action is the stronger move.",
  },
  {
    q: "When do I pay?",
    a: "The assessment enquiry does not require payment to submit. Guided is an upfront fee if you choose that route. Managed is £0 today, with a success fee only when the defined successful outcome is achieved under the service terms.",
  },
  {
    q: "What happens after Google responds?",
    a: "We help you understand what the response means for the next step. Google still controls the platform decision and the timeframe. Optional Relaunch Guard monitoring can follow once the immediate case is resolved or stabilised.",
  },
] as const

export const howFaqIntro = {
  eyebrow: "Process questions",
  title: "How the operating model actually works.",
  lead: "These answers cover starting, assessment, authorisation and payment — not every service-specific FAQ.",
} as const

export const howClose = {
  eyebrow: "Start the process",
  title: "You bring the situation. We'll help make the route clear.",
  lead: "Start with what changed, what Google told you and what you've already tried.",
  primaryCta: "Start your assessment",
  primaryHref: howHelpHref,
  secondaryCta: "View pricing",
  secondaryHref: howPricingHref,
} as const
