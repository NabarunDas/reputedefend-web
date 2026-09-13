import { brandName } from "@/lib/brand"
import { hasLegalValue, legalIdentity } from "@/lib/legal"

export const contactHelpHref = "/get-help"
export const contactPrivacyHref = "/privacy"

export const contactSeo = {
  titlePage: "Contact ProfileRelaunch — General Enquiries",
  description:
    "Contact ProfileRelaunch with a general question about the service, process or a professional enquiry. For an active Google Business Profile or review issue, start the dedicated assessment on Get Help.",
} as const

export const contactHero = {
  eyebrow: "Contact ProfileRelaunch",
  title: "Have a question before you start?",
  lead:
    "Use this page for general questions about ProfileRelaunch, our services, pricing or process, and for partnership or professional enquiries. If you already have a live Business Profile or review issue, use Get Help so we can collect the right case information.",
  assessmentCta: "Start an active case assessment",
  assessmentHref: contactHelpHref,
  supportLine: "Human-reviewed messages • Clear routing • No need for a case file",
} as const

export const contactRoutes = {
  eyebrow: "Not sure which route?",
  general: {
    status: "Stay here",
    title: "General question",
    copy: "Send a short message on this page.",
    examples: [
      "A question about ProfileRelaunch",
      "A service or process question",
      "Partnership",
      "Media or professional enquiry",
    ],
  },
  active: {
    status: "Use Get Help",
    title: "Active Google issue",
    copy: "Use the dedicated assessment instead of this form.",
    examples: [
      "Suspension or restricted profile",
      "Verification or access issue",
      "Profile Recovery",
      "A suspicious review",
    ],
    cta: "Start your assessment",
    href: contactHelpHref,
  },
} as const

export const contactBanner = {
  title: "Already dealing with an active Google issue?",
  copy:
    "If the Business Profile is suspended, disabled, inaccessible or stuck in verification, or you need help assessing a suspicious review, the dedicated assessment collects the right information.",
  cta: "Start your assessment",
  href: contactHelpHref,
} as const

export const contactProcess = {
  title: "What happens next",
  steps: [
    { n: "01", title: "We review your message" },
    { n: "02", title: "We identify the right route" },
    { n: "03", title: "We reply or point you to the appropriate next step" },
  ] as const,
} as const

export const contactTrust = [
  "Human-reviewed messages",
  "Clear routing to Get Help when needed",
  "UK-based operator, global service",
  "No passwords or security codes",
] as const

export const contactIdentity = {
  positioning: `${brandName} is a UK-based independent business supporting businesses internationally.`,
  emailLabel: "Prefer email?",
  email: hasLegalValue(legalIdentity.contactEmail) ? legalIdentity.contactEmail : undefined,
} as const

export const contactClose = {
  title: "If this is an active Profile or Review issue, start the assessment instead.",
  cta: "Start your assessment",
  href: contactHelpHref,
} as const
