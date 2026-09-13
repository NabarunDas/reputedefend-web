/**
 * Commercial routes that future Resources articles may link to.
 * Editorial usefulness first — do not inject these every few paragraphs.
 */
export const resourceCommercialHrefs = {
  profileRecovery: "/business-profile-recovery",
  reviewProtection: "/review-protection",
  howItWorks: "/how-it-works",
  pricing: "/pricing",
  getHelp: "/get-help",
  profileAssessment: "/get-help?service=profile-recovery",
  reviewAssessment: "/get-help?service=review",
} as const

export type ResourceCommercialRoute = "profile-recovery" | "review-protection" | "general"

export type ResourceConversionCopy = {
  heading: string
  body: string
  cta: string
  href: string
  trustLine: string
  exploreLabel: string
  exploreHref: string
}

export function conversionForCommercialRoute(
  route: ResourceCommercialRoute,
): ResourceConversionCopy {
  if (route === "profile-recovery") {
    return {
      heading: "Dealing with this now?",
      body:
        "You don't need to work out the cause before asking for help. Tell us what happened, what Google has told you and what you have already tried.",
      cta: "Start your Profile Recovery assessment",
      href: resourceCommercialHrefs.profileAssessment,
      trustLine: "No fee to submit • Human-reviewed • No passwords or verification codes",
      exploreLabel: "Explore Profile Recovery",
      exploreHref: resourceCommercialHrefs.profileRecovery,
    }
  }

  if (route === "review-protection") {
    return {
      heading: "Dealing with this now?",
      body:
        "You don't need to diagnose every review before asking for help. Tell us what appeared, what Google has told you and what you have already tried.",
      cta: "Start your Review Protection assessment",
      href: resourceCommercialHrefs.reviewAssessment,
      trustLine: "No fee to submit • Human-reviewed • No passwords or verification codes",
      exploreLabel: "Explore Review Protection",
      exploreHref: resourceCommercialHrefs.reviewProtection,
    }
  }

  return {
    heading: "Dealing with this now?",
    body:
      "If you would rather not work through this alone, tell us what happened and what you have already tried. A human will review the situation.",
    cta: "Start your assessment",
    href: resourceCommercialHrefs.getHelp,
    trustLine: "No fee to submit • Human-reviewed • No passwords or verification codes",
    exploreLabel: "See how it works",
    exploreHref: resourceCommercialHrefs.howItWorks,
  }
}
