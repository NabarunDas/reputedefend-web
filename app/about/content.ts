import { brandName, brandTagline } from "@/lib/brand"
import { isSoleTrader, legalIdentity, tradingAsLine } from "@/lib/legal"

export const aboutHelpHref = "/get-help"
export const aboutHowHref = "/how-it-works"
export const aboutPricingHref = "/pricing"
export const aboutRecoveryHref = "/business-profile-recovery"
export const aboutReviewHref = "/review-protection"
export const aboutContactHref = "/contact"
export const aboutPrivacyHref = "/privacy"
export const aboutTermsHref = "/terms"
export const aboutDisclaimerHref = "/disclaimer"

export const aboutSeo = {
  titlePage: "About ProfileRelaunch — Google Business Profile Recovery & Review Protection",
  description:
    "ProfileRelaunch is a human-reviewed, evidence-led service for Google Business Profile recovery and review protection. Operated transparently and designed to support businesses internationally.",
} as const

export const aboutHero = {
  eyebrow: "About ProfileRelaunch",
  titleLines: ["Built for the moment", "Google becomes a business problem."] as const,
  lead:
    "ProfileRelaunch exists to help businesses make sense of difficult Google Business Profile and review situations — then turn that understanding into a clear, evidence-led next step.",
  primaryCta: "Start your assessment",
  primaryHref: aboutHelpHref,
  secondaryCta: "How it works",
  secondaryHref: aboutHowHref,
  supportLine: "Human-reviewed • Evidence-led • Independent specialist service",
} as const

export const aboutIdentityPlate = {
  name: brandName,
  operatedBy: `Operated by ${legalIdentity.legalName ?? brandName}`,
  lines: ["UK-based", "Global service", "Independent specialist support"] as const,
} as const

export const aboutWhy = {
  eyebrow: "Origin",
  title: "Why ProfileRelaunch exists.",
  lead:
    "A legitimate business can suddenly lose Google visibility, get stuck in verification, lose access, receive a suspension, or face a suspicious review.",
  moment: [
    "the platform language can be difficult to interpret",
    "the owner may not know which evidence matters",
    "repeated random changes may create more confusion",
    "the next Google route may not be obvious",
    "generic advice online may not fit the specific case",
  ] as const,
  close:
    "ProfileRelaunch was created to close that gap. The objective is not to beat Google. It is to help a legitimate business present and manage its case clearly and appropriately.",
  chain: [
    { n: "01", title: "Understand" },
    { n: "02", title: "Organise" },
    { n: "03", title: "Recommend" },
    { n: "04", title: "Prepare / manage" },
  ] as const,
} as const

export const aboutBrandLine = {
  title: brandName,
  copy: `${brandName} represents the two things the service is built around.`,
  tagline: brandTagline,
} as const

export function aboutOperator() {
  const structure = isSoleTrader() ? "as a UK sole trader" : "as an independent business"
  return {
    eyebrow: "Accountability",
    title: "A real operator behind the service.",
    lead: `${brandName} is operated by ${tradingAsLine()}, ${structure}.`,
    positioning: `${brandName} is UK-based and designed to support businesses internationally, subject to the relevant Google process being available and supportable.`,
    purpose: "The operator, the business identity and the contact route are stated openly so you know who you are dealing with.",
    links: [
      { href: aboutPrivacyHref, label: "Privacy" },
      { href: aboutTermsHref, label: "Terms" },
      { href: aboutDisclaimerHref, label: "Disclaimer" },
      { href: aboutContactHref, label: "Contact" },
    ] as const,
  }
}

export const aboutHuman = {
  eyebrow: "How we think",
  title: "What human-reviewed means here.",
  lead:
    "Customer submissions are considered in context. Timeline, Google notices, previous attempts, evidence quality, and any gaps or contradictions all matter. Recommendations are not produced as a fake probability score.",
  points: [
    "The situation is read as a case, not a form score",
    "What happened, when, and what Google said are weighed together",
    "Previous attempts and missing evidence are part of the picture",
    "The recommendation is reviewed by a person before it reaches you",
  ] as const,
  tools:
    "Tools may assist the process. The customer-facing recommendation is reviewed by a person.",
} as const

export const aboutPrinciples = {
  eyebrow: "Philosophy",
  title: "How we work.",
  items: [
    {
      label: "Understand before acting",
      body: "Do not make random changes before understanding the issue.",
    },
    {
      label: "Evidence before assertion",
      body: "Separate what can be supported from what is suspected.",
    },
    {
      label: "Recommend the appropriate route",
      body: "Paid work is not always the right recommendation.",
    },
    {
      label: "Make the work concrete",
      body: "Evidence, timeline, wording and submission route should be organised.",
    },
    {
      label: "Keep the customer in control",
      body: "The customer understands the route, the fee and what they still need to do.",
    },
  ] as const,
} as const

export const aboutHold = {
  eyebrow: "Assessment first",
  title: "Sometimes the right recommendation is not to pay us yet.",
  lead:
    "An assessment can conclude that more evidence is needed, a different Google route should be tried, a professional review response is more appropriate than a challenge, the case needs specialist review, or paid execution support is not justified yet.",
  close: "That is part of a credible specialist process, not a sales detour.",
} as const

export const aboutServices = {
  eyebrow: "What we help with",
  title: "Two services. Different problems.",
  recovery: {
    title: "Profile Recovery",
    href: aboutRecoveryHref,
    cta: "Explore Profile Recovery",
    points: ["Suspension", "Disabled profile", "Verification", "Access", "Recovery / appeal preparation"] as const,
  },
  review: {
    title: "Review Protection",
    href: aboutReviewHref,
    cta: "Explore Review Protection",
    points: [
      "Suspicious, abusive or potentially policy-breaching review",
      "Challenge / report preparation",
      "Professional response where appropriate",
    ] as const,
  },
} as const

export const aboutSupport = {
  eyebrow: "After the assessment",
  title: "If paid support makes sense, you choose how it is done.",
  guided: {
    label: "Guided",
    line: "We prepare it. You submit it.",
  },
  managed: {
    label: "Managed",
    line: "You authorise us. We manage the agreed case work.",
  },
  cta: "View pricing",
  href: aboutPricingHref,
} as const

export const aboutControl = {
  eyebrow: "Accountability",
  title: "Clear about what we control — and what Google controls.",
  we: {
    title: "ProfileRelaunch can control",
    items: [
      "quality of assessment",
      "evidence organisation",
      "case preparation",
      "clarity of recommendation",
      "agreed support work",
    ] as const,
  },
  google: {
    title: "Google controls",
    items: [
      "reinstatement",
      "verification decisions",
      "review removal",
      "platform response times",
      "its own policies and processes",
    ] as const,
  },
  independence: `${brandName} is an independent service and is not Google or an official Google support channel.`,
  security: {
    title: "We do not ask for Google passwords, OTPs, security codes or security answers.",
    body: "Owner-only and security actions remain with the customer.",
  },
} as const

export const aboutClose = {
  eyebrow: "Next step",
  title: "You do not need to know the answer before you start.",
  lead:
    "Tell us what happened, what Google told you and what you already tried. We will help make the next route clearer.",
  primaryCta: "Start your assessment",
  primaryHref: aboutHelpHref,
  secondaryCta: "View how it works",
  secondaryHref: aboutHowHref,
  tertiaryCta: "Contact us",
  tertiaryHref: aboutContactHref,
} as const
