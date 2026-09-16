import { pricingGroups, pricingLabel, pricingNote } from "@/lib/pricing"

const reviewGroup = pricingGroups[1]
const guided = reviewGroup.items[0]
const managed = reviewGroup.items[1]

export const reviewHelpHref = "/get-help?service=review"
export const reviewPricingHref = "/pricing"

export const reviewSeo = {
  titlePage: "Google Review Protection & Review Challenge Support",
  description:
    "Google review protection when a suspicious, abusive or potentially policy-breaching review is damaging trust. Human-reviewed help to assess the evidence and prepare a challenge, report or professional response.",
} as const

export const reviewHero = {
  eyebrow: "Google Review Protection",
  titleLines: ["A damaging review deserves", "more than a rushed response."] as const,
  lead:
    "When a suspicious, abusive or potentially policy-breaching Google review is affecting trust in your business, ProfileRelaunch helps you assess what the review actually raises, organise the evidence and choose the strongest appropriate route — challenge, report or professional response.",
  primaryCta: "Start your assessment",
  primaryHref: reviewHelpHref,
  secondaryCta: "View review pricing",
  secondaryHref: reviewPricingHref,
  supportLine: "Human-reviewed • Evidence-led • Challenge or response route",
} as const

export const reviewTrustStrip = [
  "Human-reviewed assessment",
  "Evidence-led review analysis",
  "Guided or Managed support",
  pricingLabel,
] as const

export const reviewSituations = {
  eyebrow: "Review situations we assess",
  title: "Does something about the review not add up?",
  lead:
    "These are situations worth a careful look. They do not automatically qualify for removal. Google decides whether a review is taken down.",
  items: [
    "Review appears unrelated to a genuine customer experience",
    "Review contains abusive or prohibited content",
    "Review appears to target the wrong business",
    "Multiple suspicious reviews appear together",
    "Review contains personal or confidential information",
    "Reviewer appears to have a conflict or unusual relationship",
    "Review may violate a specific Google policy",
    "You've already reported the review without success",
  ],
  unsure: "Not sure whether it qualifies?",
  cta: "Start your assessment.",
} as const

export const reviewJudgement = {
  eyebrow: "A specialist distinction",
  title: "Negative is not the same as policy-breaching.",
  lead:
    "Genuine negative feedback may remain even when the business disagrees with it. A removal challenge needs a reason grounded in policy and context. Emotional disagreement is not evidence.",
  points: [
    {
      title: "Ordinary criticism can stay",
      copy: "A customer who had a real experience may leave a review you consider unfair. That is not automatically a policy issue.",
    },
    {
      title: "A challenge needs a grounded reason",
      copy: "The case is stronger when the content, context and records point to a specific policy concern — not to dislike of the rating.",
    },
    {
      title: "A professional response can be the stronger move",
      copy: "When removal is unlikely, the reply future customers read may protect trust more than another unsupported report.",
    },
    {
      title: "Assessment chooses the route",
      copy: "Challenge, reporting or response is a conclusion after the evidence is reviewed — not a promise made in advance.",
    },
  ],
} as const

export const reviewAssessment = {
  eyebrow: "What we examine",
  title: "The assessment works from what is actually visible and what you can share.",
  lead:
    "We do not have access to a reviewer's private identity or to Google's internal review systems. We do not investigate people invasively, and we do not publish private customer information.",
  items: [
    { title: "Review content", copy: "What the review actually says, and what it does not." },
    { title: "Reviewer context visible publicly", copy: "What can be observed from the public profile of the review — not private identity." },
    { title: "Business records relevant to the claim", copy: "Appointments, orders or other records that relate to what the review alleges, where you hold them." },
    { title: "Timeline and transaction records where available", copy: "Dates that help show whether the review matches a genuine interaction." },
    { title: "Screenshots and links", copy: "The review URL, wording and any copies you have already captured." },
    { title: "Previous reporting attempts", copy: "What was already submitted, when, and through which route." },
    { title: "Google's response, if any", copy: "Any reply or outcome already received." },
    { title: "Policy category potentially relevant", copy: "Whether a specific Google review policy appears to fit the facts." },
    { title: "Context from the business", copy: "What you have checked, what remains unknown, and what you want protected in any public reply." },
  ],
} as const

export const reviewEvidence = {
  eyebrow: "Useful evidence",
  title: "Bring what supports the concern. Leave the rest.",
  lead:
    "You do not need a finished case file. Relevant material helps; irrelevant private information does not.",
  items: [
    "Review URL",
    "Screenshots of the review as it appears",
    "Date posted",
    "Business or customer records relevant to the claim",
    "Evidence that the review may refer to the wrong business",
    "Previous report or challenge details",
    "Google's response, if you received one",
    "Contextual records relevant to a policy concern",
  ],
  privacy:
    "Do not send passwords, verification codes or unnecessary sensitive personal information.",
} as const

export const reviewWork = {
  eyebrow: "What the fee is for",
  title: "What you're paying for is the case, not a promise.",
  lead:
    "Guided and Managed both start with the same human assessment. The paid work is deciding whether there is a case, organising it, and preparing the right route.",
  items: [
    "Assess the review against relevant policy and context",
    "Identify the strongest applicable challenge reason, if there is one",
    "Organise supporting evidence and set aside noise",
    "Prepare challenge or reporting wording",
    "Prepare the submission route that fits",
    "Review previous failed attempts so the next step is not a repeat",
    "Prepare a professional response where response is the better route",
  ],
} as const

export const reviewModels = {
  eyebrow: "Guided or Managed",
  title: "Choose how much of the review case you want us to handle.",
  lead:
    "Both options start with an assessment. The difference is who prepares the case, who submits the challenge or report, and when you pay.",
  guided: {
    name: "Guided Review",
    price: guided.price,
    cadence: guided.cadence,
    line: "We prepare it. You submit it.",
    copy:
      "We assess the review, organise the evidence and prepare the challenge, reporting or response material, with instructions for submitting a challenge or report through the appropriate Google route. You remain the person who files it.",
    points: [
      "Review assessment",
      "Policy and context analysis",
      "Evidence organisation",
      "Challenge or reporting preparation",
      "Submission instructions",
      "Professional response wording where appropriate",
      "You submit the challenge or report",
    ],
    cta: "Choose Guided",
    href: reviewHelpHref,
  },
  managed: {
    name: "Managed Review",
    price: managed.price,
    cadence: managed.cadence,
    today: managed.detail ?? "£0 today",
    line: "You authorise us. We manage the case.",
    copy:
      "After the same assessment, we organise the evidence, prepare the case and manage the agreed review case work with your authorisation. You complete any owner-only or account-specific step if Google requires it. The Managed success fee is payable only when the defined successful removal outcome is achieved under the service terms.",
    points: [
      "The same assessment",
      "Evidence organisation",
      "Case preparation",
      "Management of the agreed review case work with your authorisation",
      "You complete any owner-only step if required",
      "Success fee only on defined successful removal",
    ],
    cta: "Start Managed assessment",
    href: reviewHelpHref,
  },
} as const

export const reviewRoutes = {
  eyebrow: "Challenge or response",
  title: "Sometimes the strongest move is a challenge. Sometimes it's the response customers see.",
  lead:
    "The route is a judgement after the evidence is reviewed. A public reply should never disclose private customer information.",
  challenge: {
    kicker: "Challenge / report",
    title: "When the available evidence suggests a possible policy issue.",
    copy:
      "We prepare a focused challenge or report so Google can consider the review against the relevant policy. This is not a claim that the review will be removed.",
  },
  response: {
    kicker: "Professional response",
    title: "When removal is unlikely, or while the review remains visible.",
    copy:
      "A careful public reply can show prospective customers that the business takes concerns seriously, correct factual context without disclosing private details, and avoid an emotional or defensive exchange.",
  },
} as const

export const reviewReported = {
  eyebrow: "Already reported?",
  title: "A rejected report is information. It is not a reason to file the same one again.",
  lead:
    "If you have already reported or challenged the review, share the original review, the reporting route used, Google's response if you have it, and the dates. Do not repeatedly submit unsupported reports. The assessment determines whether another challenge, a different route or a professional response is appropriate.",
  points: [
    "Share the original review",
    "Tell us what reporting route was used",
    "Include Google's response if available",
    "Provide dates",
    "Do not repeatedly submit unsupported reports",
  ],
  cta: "Start your assessment",
  href: reviewHelpHref,
} as const

export const reviewProcess = {
  eyebrow: "The review path",
  title: "From the review in front of you to a route that fits the facts.",
  steps: [
    { n: "01", title: "Share the review and what concerns you" },
    { n: "02", title: "We assess the review, context and evidence" },
    { n: "03", title: "We identify the strongest appropriate route" },
    { n: "04", title: "Choose Guided or Managed" },
    { n: "05", title: "Prepare or manage the case" },
    { n: "06", title: "Google makes the final removal decision", quiet: true },
  ],
} as const

export const reviewPricing = {
  eyebrow: pricingLabel,
  title: "Clear fees for Review Protection.",
  lead: "Guided is payment for preparation. Managed is a success-fee model.",
  items: [
    {
      name: guided.name,
      figure: guided.price,
      detail: `${guided.cadence}. We prepare it. You submit it.`,
    },
    {
      name: managed.name,
      figure: managed.detail ?? "£0 today",
      detail: `${managed.price} ${managed.cadence}.`,
    },
  ],
  note: pricingNote,
  primaryCta: "View full pricing",
  primaryHref: reviewPricingHref,
  secondaryCta: "Start your assessment",
  secondaryHref: reviewHelpHref,
} as const

export const reviewFaqs = [
  {
    q: "Can you remove a fake Google review?",
    a: "Google decides whether a review is removed. We can help you assess whether the content or context may raise a policy issue and prepare a challenge or report. A review that feels fake is not automatically treated as fake, and we do not remove reviews ourselves.",
  },
  {
    q: "How do I know if a review breaches Google policy?",
    a: "Policy turns on the content, context and available evidence — not on whether the business disagrees with the rating. The assessment looks at what the review says, what can be observed publicly and what records you can share. We do not have access to Google's internal review systems.",
  },
  {
    q: "Can you help with a genuine negative review?",
    a: "Yes, but usually as a response case rather than a removal case. Ordinary negative feedback from a real experience is not automatically a policy violation. A professional public reply may be the stronger reputation move.",
  },
  {
    q: "What evidence should I provide?",
    a: "The review URL, screenshots, the date posted, any relevant business records, previous report details and Google's reply if you have one. Do not send passwords, verification codes or unnecessary sensitive personal information.",
  },
  {
    q: "Can you help if Google already rejected my report?",
    a: "Yes. Share what was submitted, the route used, the dates and any reply. Another report is not automatically appropriate. The assessment determines whether a different challenge, a response or no further platform step is the stronger move.",
  },
  {
    q: "How long does review removal take?",
    a: "There is no reliable public timescale. Timing depends on the issue and how Google handles the case. We help you prepare a clearer next step; we cannot control how long a platform review takes.",
  },
  {
    q: "What is Guided vs Managed for Review Protection?",
    a: `Guided Review is ${guided.price} ${guided.cadence}: we prepare it and you submit it. Managed Review is ${managed.detail}, with ${managed.price} ${managed.cadence}: you authorise us and we manage the agreed review case work. Both start with the same assessment. You still complete any owner-only Google step if required.`,
  },
  {
    q: "Do you guarantee review removal?",
    a: "No. Google makes the final removal decision. The service is structured assessment and case preparation — and, if you choose Managed, agreed case work under the service terms — not a promised outcome.",
  },
  {
    q: "What does Managed Review success mean?",
    a: "The Managed success fee is payable only when the defined successful removal outcome is achieved under the service terms. That definition is explained before you decide. It is not a general promise that every damaging review will be taken down.",
  },
  {
    q: "Can you help write a public response?",
    a: "Yes, where a professional reply is the stronger route, or while a review remains visible. The wording should be calm, factually careful and free of private customer information.",
  },
] as const

export const reviewClosing = {
  eyebrow: "Start the review assessment",
  title: "Start with the review. We'll help you decide the strongest next move.",
  lead: "Share the review, why it concerns you and anything you've already tried.",
  primaryCta: "Start your assessment",
  primaryHref: reviewHelpHref,
  secondaryCta: "View pricing",
  secondaryHref: reviewPricingHref,
} as const
