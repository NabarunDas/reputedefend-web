/**
 * Fixed script for the Telloya marketing illustration.
 * Rendered entirely in the browser. It is not a call, a recording, or a lead.
 */
export const DEMO_SCRIPT_VERSION = "telloya-interactive-demo-v1" as const

export const DEMO_DISCLOSURE =
  "Fictional browser-only walkthrough. It does not place a telephone call or save a customer enquiry."

export const demoPageCopy = {
  seo: {
    title: "See how Telloya works",
    description:
      "Watch an illustrative Telloya film, from a missed call to follow-up, then step through a fictional enquiry. The walkthrough does not place a call or save an enquiry.",
  },
  eyebrow: "See Telloya in action",
  title: "See how Telloya works",
  lead: "From missed call to meaningful follow-up.",
  filmNote: "Illustrative demonstration featuring fictional characters and enquiries.",
  walkthroughTitle: "Explore the conversation step by step",
  walkthroughLead:
    "Follow a fictional customer conversation and see how Telloya prepares an enquiry summary.",
  fictionNote:
    "Alex Rowan, Hartley Plumbing, Larkspur Close and Fernwick are fictional. No telephone number is shown, and no visit is booked.",
  playerTitle: "Sample conversation",
  pricingCta: "Explore Pricing",
  pricingHref: "/pricing",
  videoEnquireCta: "Enquire about Telloya",
  enquireCta: "Enquire About Telloya",
  enquireHref: "/enquire",
  ctaTitle: "See whether Telloya fits the way you work",
  ctaLead:
    "Pricing explains the published plans. An enquiry asks for a conversation. Neither one starts the service or takes payment.",
  personalisedDemoTitle: "Request a personalised demo",
  personalisedDemoLead:
    "Tell us about your business and the questions you'd like your receptionist to ask. We'll arrange a personalised live demonstration so you can experience a real AI conversation configured for your business.",
} as const

export const demoStages = [
  { id: "occupied", label: "Owner occupied" },
  { id: "forwarded", label: "Conditional forward" },
  { id: "greeting", label: "Greeting" },
  { id: "problem", label: "The problem" },
  { id: "details", label: "Details" },
  { id: "summary", label: "Lead summary" },
] as const

export type DemoStageId = (typeof demoStages)[number]["id"]

export type DemoBeat =
  | {
      id: string
      stage: Exclude<DemoStageId, "summary">
      kind: "scene"
      title: string
      body: string
    }
  | {
      id: string
      stage: Exclude<DemoStageId, "summary">
      kind: "line"
      speaker: "telloya" | "caller"
      text: string
    }

export const demoBeats = [
  {
    id: "call",
    stage: "occupied",
    kind: "scene",
    title: "A customer calls during a job",
    body: "Alex Rowan calls Hartley Plumbing. The owner is occupied on another job and does not answer.",
  },
  {
    id: "forward",
    stage: "forwarded",
    kind: "scene",
    title: "The unanswered call is forwarded",
    body: "In this example, Hartley Plumbing has already set conditional forwarding, and the provider supports it. The missed call is forwarded to Telloya. That setup is assumed here. It depends on the customer's telephone provider and location, and it is not available for every line.",
  },
  {
    id: "greet",
    stage: "greeting",
    kind: "line",
    speaker: "telloya",
    text: "Hello, you've reached Hartley Plumbing. I'm an AI receptionist. The owner is on a job and can't take your call. I can collect an enquiry so they can decide whether to call you back. Would you like to continue?",
  },
  {
    id: "accept",
    stage: "greeting",
    kind: "line",
    speaker: "caller",
    text: "Yes, please.",
  },
  {
    id: "problem",
    stage: "problem",
    kind: "line",
    speaker: "caller",
    text: "The kitchen tap is dripping into the sink. I'd like someone to look at it.",
  },
  {
    id: "ask",
    stage: "details",
    kind: "line",
    speaker: "telloya",
    text: "Thank you. What is the approximate location, how should the business reach you, and when would you prefer a callback? I will not book a visit.",
  },
  {
    id: "answer",
    stage: "details",
    kind: "line",
    speaker: "caller",
    text: "It's 14 Larkspur Close in Fernwick. I've given a callback number. Tomorrow afternoon would suit me.",
  },
  {
    id: "close",
    stage: "details",
    kind: "line",
    speaker: "telloya",
    text: "I'll pass on a kitchen tap drip at 14 Larkspur Close, Fernwick, and a preferred callback tomorrow afternoon. Hartley Plumbing decides whether and when to call. Nothing is booked.",
  },
] as const satisfies readonly DemoBeat[]

export const demoLead = {
  business: "Hartley Plumbing",
  caller: "Alex Rowan",
  serviceRequested: "Kitchen tap repair",
  problem: "Kitchen tap dripping into the sink",
  approximateLocation: "14 Larkspur Close, Fernwick",
  callbackNumberStatus: "A callback number was collected in this example and is not shown",
  preferredCallbackWindow: "Tomorrow afternoon. No visit is booked.",
} as const

export const DEMO_SUMMARY_INDEX = demoBeats.length

export function nextDemoPosition(position: number): number {
  if (position < 0) return 0
  return Math.min(DEMO_SUMMARY_INDEX, position + 1)
}

export function previousDemoPosition(position: number): number {
  if (position <= 0) return position < 0 ? -1 : 0
  return position - 1
}

export function stageForPosition(position: number): DemoStageId | null {
  if (position < 0) return null
  if (position >= DEMO_SUMMARY_INDEX) return "summary"
  return demoBeats[position].stage
}

export function demoLiveStatus(position: number): string {
  if (position < 0) return "Sample ready. Use Start the sample."
  if (position >= DEMO_SUMMARY_INDEX) {
    return [
      "Lead summary for Hartley Plumbing.",
      `Service requested: ${demoLead.serviceRequested}.`,
      `Problem: ${demoLead.problem}.`,
      `Approximate location: ${demoLead.approximateLocation}.`,
      `Callback number: ${demoLead.callbackNumberStatus}.`,
      `Preferred callback window: ${demoLead.preferredCallbackWindow}`,
    ].join(" ")
  }
  const beat = demoBeats[position]
  if (beat.kind === "scene") return `${beat.title}. ${beat.body}`
  const speaker = beat.speaker === "telloya" ? "Telloya" : "Alex Rowan, fictional caller"
  return `${speaker}. ${beat.text}`
}
