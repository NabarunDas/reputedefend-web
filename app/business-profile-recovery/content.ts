import { earlyAccessLabel, pricingGroups, pricingNote } from "@/lib/pricing"

const profileRecovery = pricingGroups[0]
const guided = profileRecovery.items[0]
const managed = profileRecovery.items[1]

export const recoveryHelpHref = "/get-help?service=profile-recovery"
export const recoveryPricingHref = "/pricing"

export const recoverySeo = {
  titlePage: "Google Business Profile Recovery & Suspension Help",
  description:
    "Google Business Profile recovery help when a listing is suspended, inaccessible or stuck in verification. Human-reviewed, evidence-led reinstatement preparation — Guided or Managed.",
} as const

export const recoveryHero = {
  eyebrow: "Google Business Profile Recovery",
  titleLines: ["Your profile is down.", "Your recovery plan shouldn't be guesswork."] as const,
  lead:
    "When a Google Business Profile is suspended, inaccessible or stuck in verification, the wrong changes or repeated unsupported appeals can make an already difficult situation harder. ProfileRelaunch helps you understand what changed, organise the evidence that matters and prepare the strongest appropriate recovery route.",
  primaryCta: "Start your assessment",
  primaryHref: recoveryHelpHref,
  secondaryCta: "View recovery pricing",
  secondaryHref: recoveryPricingHref,
  supportLine: "Human-reviewed • Evidence-led • Guided or Managed",
} as const

export const recoveryTrustStrip = [
  "Human-reviewed assessment",
  "Evidence-led recovery route",
  "Guided or Managed support",
  earlyAccessLabel,
] as const

export const recoverySituations = {
  eyebrow: "Profile problems we assess",
  title: "If your listing has changed, this is the work we handle.",
  lead:
    "Suspension, access and verification issues are different on the surface. The starting point is the same: what changed, what Google has told you, and what you have already tried.",
  items: [
    "Profile suspended",
    "Profile disabled",
    "Verification repeatedly rejected",
    "Verification stuck",
    "Lost owner or manager access",
    "Profile disappeared",
    "Appeal already submitted",
    "Previous recovery attempt unsuccessful",
  ],
  unsure: "Not sure what caused it?",
  ctaLead: "Start with what changed.",
} as const

export const recoveryExpertise = {
  eyebrow: "Understand before changing",
  title: "Guessing at the next edit is not a recovery plan.",
  lead:
    "It is reasonable to want the listing back quickly. Unstructured reactions can still add confusion: they mix the timeline, scatter the evidence and make the next submission harder to explain. A structured assessment is what you are paying for — not a promise that Google will reverse the decision.",
  items: [
    {
      title: "Repeatedly editing core business information",
      copy: "Several changes at once can make it harder to see what happened, and harder to present a consistent picture.",
    },
    {
      title: "Submitting multiple unsupported attempts",
      copy: "Another appeal is not automatically the next step. What was already sent, and how Google replied, should be understood first.",
    },
    {
      title: "Changing several things at once",
      copy: "If the listing is already restricted, extra activity is not always useful activity.",
    },
    {
      title: "Sending irrelevant evidence",
      copy: "Volume is not the same as relevance. The case is stronger when the material matches the issue.",
    },
    {
      title: "Treating the visible symptom as the cause",
      copy: "What customers see — a missing listing, a failed verification, a lock-out — is not always the full position.",
    },
  ],
} as const

export const recoveryAssessment = {
  eyebrow: "What we review",
  title: "The assessment works from what you can actually share.",
  lead:
    "We do not have access to Google's internal enforcement systems. We work from the notice, the listing as you can see it, the timeline and the records you hold.",
  items: [
    {
      title: "Google notice or suspension message",
      copy: "What Google has communicated, when it appeared, and the wording you still have.",
    },
    {
      title: "Business Profile URL and current status",
      copy: "Whether the listing is suspended, disabled, inaccessible, missing, or stuck in verification.",
    },
    {
      title: "Recent profile changes",
      copy: "Edits, ownership changes or other activity around the time the issue started.",
    },
    {
      title: "Verification history",
      copy: "Attempts, methods, rejections and anything still pending.",
    },
    {
      title: "Previous appeals or attempts",
      copy: "What was submitted, when, and any reply — so the next move is not a repeat of a failed one.",
    },
    {
      title: "Business identity and eligibility evidence",
      copy: "Records that may support who the business is and that the listing relates to it.",
    },
    {
      title: "Website and business consistency where relevant",
      copy: "Public information that should align with the profile, if that is material to the case.",
    },
  ],
} as const

export const recoveryWork = {
  eyebrow: "What the fee is for",
  title: "After the assessment, the work is preparation — not hope.",
  lead:
    "Guided and Managed both start with the same human review. The paid work is organising a recovery case that can actually be used.",
  items: [
    "Identify the evidence that is relevant to this issue",
    "Set aside material that adds noise rather than support",
    "Organise the timeline so the case can be read in order",
    "Prepare recovery or appeal wording that matches the available evidence",
    "Check that claims align with the records you can produce",
    "Prepare the submission route that fits the current position",
  ],
} as const

export const recoveryModels = {
  eyebrow: "Guided or Managed",
  title: "Choose how much of the recovery process you want us to handle.",
  lead:
    "Both options start with an assessment. The difference is who prepares the case, who submits it, and when you pay.",
  guided: {
    name: "Guided Relaunch",
    price: guided.price,
    cadence: guided.cadence,
    line: "We prepare it. You submit it.",
    copy:
      "We assess the situation, organise the evidence and prepare the recovery or appeal material, with instructions for submitting it through the appropriate Google route. You remain the person who files it.",
    points: [
      "Case assessment",
      "Evidence organisation",
      "Recovery or appeal preparation",
      "Submission instructions",
      "You submit through the appropriate Google route",
    ],
    cta: "Choose Guided",
    href: recoveryHelpHref,
  },
  managed: {
    name: "Managed Relaunch",
    price: managed.price,
    cadence: managed.cadence,
    today: managed.detail ?? "£0 today",
    line: "You authorise us. We manage the case.",
    copy:
      "After the same assessment, we organise the evidence, prepare the case and manage the agreed case work with your authorisation. The success fee is due only if the defined successful restoration is achieved under the service terms.",
    points: [
      "Case assessment",
      "Evidence organisation",
      "Case preparation",
      "Management of the agreed case work with your authorisation",
      "Success fee only on defined successful restoration",
    ],
    cta: "Start Managed assessment",
    href: recoveryHelpHref,
  },
} as const

export const recoveryPricing = {
  eyebrow: earlyAccessLabel,
  title: "Clear fees for Profile Recovery.",
  lead: "Guided is payment for preparation. Managed is a success-fee model.",
  items: [
    {
      name: guided.name,
      figure: guided.price,
      detail: `${guided.cadence}. ${guided.detail}`,
    },
    {
      name: managed.name,
      figure: managed.detail ?? "£0 today",
      detail: `${managed.price} ${managed.cadence}.`,
    },
  ],
  note: pricingNote,
  primaryCta: "Start your assessment",
  primaryHref: recoveryHelpHref,
  secondaryCta: "View pricing",
  secondaryHref: recoveryPricingHref,
} as const

export const recoveryProcess = {
  eyebrow: "The recovery path",
  title: "From what changed to a case Google can actually review.",
  steps: [
    { n: "01", title: "Tell us what happened" },
    { n: "02", title: "We review the profile, timeline and evidence" },
    { n: "03", title: "We recommend the recovery route" },
    { n: "04", title: "Choose Guided or Managed" },
    { n: "05", title: "Prepare or manage the case" },
    { n: "06", title: "Google makes the final platform decision" },
  ],
} as const

export const recoveryAppealed = {
  eyebrow: "Already appealed?",
  title: "A rejected attempt is information. It is not a reason to repeat the same file.",
  lead:
    "If you have already submitted an appeal or recovery request, send what was submitted, Google's reply, and the dates. Do not automatically file another attempt. The assessment should determine whether another submission is the right next move — and if it is, how it should differ.",
  points: [
    "Send what was submitted",
    "Include Google's reply",
    "Include dates and the timeline",
    "Do not automatically submit another attempt",
  ],
  cta: "Start your assessment",
  href: recoveryHelpHref,
} as const

export const recoveryFaqs = [
  {
    q: "Why was my Google Business Profile suspended?",
    a: "Google's notice is the starting point, not always a complete explanation. Common situations include verification or eligibility questions, access or ownership issues, and policy concerns. The useful first step is to keep the notice, the timeline and anything already tried, then assess those facts rather than guessing a cause.",
  },
  {
    q: "Can you tell exactly why Google suspended it?",
    a: "Only to the extent Google has told you, plus what can reasonably be inferred from the listing, timeline and records you can share. We do not have access to Google's internal enforcement systems and we do not invent a reason Google has not provided.",
  },
  {
    q: "What evidence should I prepare?",
    a: "Keep the Google notice, the profile URL, dates, previous submissions and replies, and accurate business records that relate to the issue. You do not need a finished case file to start. The assessment identifies what is relevant and what is not.",
  },
  {
    q: "Can you help if my appeal was rejected?",
    a: "Yes. Share what you submitted, when you submitted it and any reply. That history is part of the current position. Another appeal is not automatically appropriate; the next step depends on what was already tried.",
  },
  {
    q: "How long does reinstatement take?",
    a: "There is no reliable public timescale. Timing depends on the type of issue, the information available and how Google handles the case. We help you prepare a clearer next step; we cannot control how long a platform review takes.",
  },
  {
    q: "What is Guided vs Managed for Profile Recovery?",
    a: `Guided Relaunch is ${guided.price} ${guided.cadence}: we prepare it and you submit it. Managed Relaunch is ${managed.detail}, with ${managed.price} ${managed.cadence}: you authorise us and we manage the agreed case work. Both start with the same assessment.`,
  },
  {
    q: "Do you guarantee reinstatement?",
    a: "No. Google makes the final platform decision. The service is structured recovery preparation and, if you choose Managed, agreed case work under the service terms — not a promised outcome.",
  },
  {
    q: "What does Managed success mean?",
    a: "The Managed success fee is payable only when the defined successful restoration is achieved under the service terms. That definition is explained before you decide. It is not a general promise that every restricted listing will return.",
  },
] as const

export const recoveryClosing = {
  eyebrow: "Start the recovery assessment",
  title: "Start with what changed. We'll help you build the recovery route.",
  lead: "Tell us what happened, what Google has told you and what you have already tried.",
  primaryCta: "Start your assessment",
  primaryHref: recoveryHelpHref,
  secondaryCta: "View pricing",
  secondaryHref: recoveryPricingHref,
} as const
