import {
  resourceCategoryHubs,
  type ResourceCategoryHubId,
  type ResourceCategoryHubPath,
} from "@/lib/resource-category-links"

export type ResourceCategoryHub = {
  category: ResourceCategoryHubId
  path: ResourceCategoryHubPath
  seoTitle: string
  description: string
  heading: string
  intro: string
  commercialHref: string
  commercialCta: string
  /** Anchor used by the Resources index card that points at this hub. */
  indexLinkLabel: string
}

/**
 * Copy for the four published Resource topic hubs. Each hub needs a unique
 * title, description, H1 and introduction; nothing here may claim a statistic,
 * outcome or credential that is not already an approved public fact.
 */
export const resourceCategoryHubContent = {
  "profile-recovery": {
    category: "profile-recovery",
    path: resourceCategoryHubs["profile-recovery"],
    seoTitle: "Google Business Profile Recovery & Suspension Guides",
    description:
      "Practical Google Business Profile recovery guides covering suspensions, reinstatement appeals, appeal evidence, rejected appeals and common profile policy issues.",
    heading: "Google Business Profile Recovery & Suspension Guides",
    intro:
      "Use these guides to understand what to check before a suspension appeal, what evidence may matter, what to do after a rejected appeal, and which Business Profile details can affect a recovery case.",
    commercialHref: "/business-profile-recovery",
    commercialCta: "Explore Profile Recovery",
    indexLinkLabel: "View all Profile Recovery guides",
  },
  "verification-access": {
    category: "verification-access",
    path: resourceCategoryHubs["verification-access"],
    seoTitle: "Google Business Profile Verification & Access Guides",
    description:
      "Practical guides for Google Business Profile verification problems, rejected or stuck verification, lost profile access, ownership issues and visibility problems.",
    heading: "Google Business Profile Verification & Access Guides",
    intro:
      "Use these guides when verification is stuck or rejected, ownership or manager access has been lost, or a Business Profile is no longer appearing as expected.",
    commercialHref: "/business-profile-recovery",
    commercialCta: "Explore Profile Recovery",
    indexLinkLabel: "View all Verification & Access guides",
  },
  "reviews-reputation": {
    category: "reviews-reputation",
    path: resourceCategoryHubs["reviews-reputation"],
    seoTitle: "Google Review Removal & Reputation Guides",
    description:
      "Practical guides to Google review removal policies, fake or suspicious reviews, rejected review reports, missing reviews and reputation-response options.",
    heading: "Google Review Removal & Reputation Guides",
    intro:
      "Use these guides to understand when Google may remove a review, how to distinguish suspicious activity from genuine negative feedback, and what options remain after reporting a review.",
    commercialHref: "/review-protection",
    commercialCta: "Explore Review Protection",
    indexLinkLabel: "View all Reviews & Reputation guides",
  },
  "review-abuse-scams": {
    category: "review-abuse-scams",
    path: resourceCategoryHubs["review-abuse-scams"],
    seoTitle: "Google Review Abuse, Extortion & Scam Guides",
    description:
      "Practical guidance for Google review bombing, review extortion, coercive review threats, conflicts of interest, paid-removal offers and Business Profile scams.",
    heading: "Google Review Abuse, Extortion & Scam Guides",
    intro:
      "Use these guides when reviews appear coordinated, coercive or connected to a scam, threat or conflict. Preserve the evidence first, then choose the appropriate Google or reputation-response route.",
    commercialHref: "/review-protection",
    commercialCta: "Explore Review Protection",
    indexLinkLabel: "View all Review Abuse & Scams guides",
  },
} as const satisfies Record<ResourceCategoryHubId, ResourceCategoryHub>

export const resourceCategoryHubBreadcrumb = {
  label: "Resources",
  href: "/resources",
} as const

export const resourceCategoryHubEmpty =
  "No guides are published in this category yet. Published guides appear here once they have been researched and reviewed." as const

export function getResourceCategoryHub(category: ResourceCategoryHubId): ResourceCategoryHub {
  return resourceCategoryHubContent[category]
}
