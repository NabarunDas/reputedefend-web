import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import type { ResourceCommercialRoute } from "@/lib/resource-links"

export const resourceAuthor = "ProfileRelaunch" as const

export const RESOURCE_CATEGORY_IDS = [
  "profile-recovery",
  "verification-access",
  "reviews-reputation",
  "review-abuse-scams",
  "policy-updates",
] as const

export type ResourceCategoryId = (typeof RESOURCE_CATEGORY_IDS)[number]

export type OfficialSource = {
  name: string
  title: string
  url: string
}

export type ResourceRecord = {
  slug: string
  title: string
  seoTitle: string
  description: string
  category: ResourceCategoryId
  excerpt: string
  published: boolean
  featured: boolean
  urgent: boolean
  datePublished: string | null
  dateReviewed: string | null
  dateModified: string | null
  readingMinutes: number | null
  officialSources: OfficialSource[]
  relatedResourceSlugs: string[]
  commercialRoute: ResourceCommercialRoute
  author: typeof resourceAuthor
  isPolicyUpdate?: boolean
  reviewedAgainstSourceDate?: string | null
  supersedesSlug?: string | null
  changeSummary?: string | null
}

export type ResourceCategory = {
  id: ResourceCategoryId
  title: string
  description: string
  urgentLabel?: string
}

export const resourceCategories: readonly ResourceCategory[] = [
  {
    id: "profile-recovery",
    title: "Profile Recovery",
    description:
      "Suspensions, disabled profiles, appeals, appeal evidence, rejected appeals and profile recovery.",
  },
  {
    id: "verification-access",
    title: "Verification & Access",
    description:
      "Verification, stuck or rejected checks, ownership, manager access and lost access.",
  },
  {
    id: "reviews-reputation",
    title: "Reviews & Reputation",
    description:
      "Suspicious reviews, fake reviews, Google review policies, reporting, appeals and professional responses.",
  },
  {
    id: "review-abuse-scams",
    title: "Review Abuse & Scams",
    description:
      "Review extortion, review bombing, threats, coercive review behaviour, malicious campaigns, fake review-removal services and impersonation or security scams.",
    urgentLabel: "Urgent situations",
  },
  {
    id: "policy-updates",
    title: "Google Policy Updates",
    description:
      "Meaningful changes in Google Business Profile policies or processes, including appeals, reviews and verification — published only when something has genuinely been reviewed and changed.",
  },
] as const

function draft(partial: Omit<ResourceRecord, "published" | "featured" | "author" | "officialSources" | "datePublished" | "dateReviewed" | "dateModified" | "readingMinutes"> & {
  officialSources?: OfficialSource[]
  featured?: boolean
}): ResourceRecord {
  return {
    ...partial,
    published: false,
    featured: partial.featured ?? false,
    author: resourceAuthor,
    officialSources: partial.officialSources ?? [],
    datePublished: null,
    dateReviewed: null,
    dateModified: null,
    readingMinutes: null,
  }
}

/**
 * Planned Resources metadata only.
 * Every record is unpublished until researched article content is supplied.
 * Do not add fake article bodies or decorative source lists here.
 */
export const resourceRegistry: readonly ResourceRecord[] = [
  draft({
    slug: "google-business-profile-suspended-before-appeal",
    title: "Google Business Profile Suspended: What to Do Before You Appeal",
    seoTitle: "Google Business Profile Suspended: What to Do Before You Appeal",
    description:
      "A plain-English guide to gathering the right information before you appeal a Google Business Profile suspension.",
    category: "profile-recovery",
    excerpt:
      "What to gather and check before you submit a Google Business Profile suspension appeal.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-appeal-evidence-checklist",
      "google-business-profile-appeal-rejected-what-next",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-appeal-evidence-checklist",
    title: "Google Business Profile Appeal Evidence Checklist",
    seoTitle: "Google Business Profile Appeal Evidence Checklist",
    description:
      "A practical checklist of evidence to organise before a Google Business Profile appeal.",
    category: "profile-recovery",
    excerpt: "The evidence to organise before you prepare a Google Business Profile appeal.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-rejected-what-next",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-appeal-rejected-what-next",
    title: "Google Business Profile Appeal Rejected: What Can You Do Next?",
    seoTitle: "Google Business Profile Appeal Rejected: What Can You Do Next?",
    description:
      "A calm next-step guide for business owners whose Google Business Profile appeal has been rejected.",
    category: "profile-recovery",
    excerpt: "What to consider after a Google Business Profile appeal is rejected.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-evidence-checklist",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-verification-stuck-or-rejected",
    title: "Google Business Profile Verification Stuck or Rejected: What to Check",
    seoTitle: "Google Business Profile Verification Stuck or Rejected: What to Check",
    description:
      "A practical checklist for a Google Business Profile verification that is stuck or has been rejected.",
    category: "verification-access",
    excerpt: "What to check when Google Business Profile verification is stuck or rejected.",
    urgent: false,
    relatedResourceSlugs: ["lost-access-to-google-business-profile"],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "can-a-google-review-be-removed",
    title: "Can a Google Review Be Removed? What Google's Policy Actually Allows",
    seoTitle: "Can a Google Review Be Removed? What Google's Policy Actually Allows",
    description:
      "A plain-English explanation of when Google may remove a review, based on official review policies.",
    category: "reviews-reputation",
    excerpt: "What Google's published review policies say about removal — and what they do not.",
    urgent: false,
    relatedResourceSlugs: [
      "fake-google-review-or-genuine-negative-feedback",
      "google-rejected-my-review-report",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "fake-google-review-or-genuine-negative-feedback",
    title: "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference",
    seoTitle: "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference",
    description:
      "A decision framework for distinguishing a suspicious Google review from genuine negative feedback.",
    category: "reviews-reputation",
    excerpt: "How to look at a Google review before deciding whether it is suspicious or genuine criticism.",
    urgent: false,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "google-review-bombing",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "google-review-extortion",
    title: "Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews",
    seoTitle: "Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews",
    description:
      "Practical first steps if someone demands money, goods or services in exchange for removing Google reviews.",
    category: "review-abuse-scams",
    excerpt:
      "What to preserve and consider if someone demands money, goods or services to remove Google reviews.",
    urgent: true,
    relatedResourceSlugs: [
      "google-review-bombing",
      "customer-threatening-bad-google-review",
      "offered-to-remove-google-reviews-for-money",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "google-review-bombing",
    title: "Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once",
    seoTitle: "Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once",
    description:
      "A calm first-response guide when several suspicious Google reviews appear in a short period.",
    category: "review-abuse-scams",
    excerpt: "What to do when several suspicious Google reviews appear in a short period.",
    urgent: true,
    relatedResourceSlugs: [
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "can-a-competitor-or-ex-employee-leave-a-google-review",
    title: "Can a Competitor or Ex-Employee Leave a Google Review?",
    seoTitle: "Can a Competitor or Ex-Employee Leave a Google Review?",
    description:
      "What Google's published review policies say about reviews from competitors, former staff and people who may not have been customers.",
    category: "reviews-reputation",
    excerpt: "How Google's published review policies treat reviews from competitors and former staff.",
    urgent: false,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "false-or-defamatory-google-reviews",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "customer-threatening-bad-google-review",
    title: "A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them",
    seoTitle: "A Customer Is Threatening a Bad Google Review Unless You Pay or Refund Them",
    description:
      "How to think about a threat to leave a Google review in a billing or refund dispute, without treating every dispute as a crime.",
    category: "review-abuse-scams",
    excerpt:
      "How to separate an ordinary customer dispute from coercive review behaviour — without labelling every refund request as extortion.",
    urgent: false,
    relatedResourceSlugs: [
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "offered-to-remove-google-reviews-for-money",
    title: "Someone Offered to Remove My Google Reviews for Money: What Should I Check?",
    seoTitle: "Someone Offered to Remove My Google Reviews for Money: What Should I Check?",
    description:
      "What to check if a third party offers paid Google review removal, including fake review-removal services.",
    category: "review-abuse-scams",
    excerpt: "What to check before paying anyone who claims they can remove Google reviews.",
    urgent: false,
    relatedResourceSlugs: [
      "google-review-extortion",
      "google-business-profile-scams",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "google-rejected-my-review-report",
    title: "Google Rejected My Review Report: What Can You Do Next?",
    seoTitle: "Google Rejected My Review Report: What Can You Do Next?",
    description:
      "A next-step guide after Google rejects a review report, based on published review policies rather than invented workarounds.",
    category: "reviews-reputation",
    excerpt: "What to consider after Google rejects a review report.",
    urgent: false,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "false-or-defamatory-google-reviews",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "lost-access-to-google-business-profile",
    title: "Lost Access to Your Google Business Profile: Ownership and Manager Options",
    seoTitle: "Lost Access to Your Google Business Profile: Ownership and Manager Options",
    description:
      "A practical explanation of ownership and manager access when you can no longer reach a Google Business Profile.",
    category: "verification-access",
    excerpt: "Ownership and manager options when you have lost access to a Google Business Profile.",
    urgent: false,
    relatedResourceSlugs: ["google-business-profile-verification-stuck-or-rejected"],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-name-rules",
    title: "Google Business Profile Name Rules Explained",
    seoTitle: "Google Business Profile Name Rules Explained",
    description:
      "A plain-English explanation of Google Business Profile name rules, based on official guidelines.",
    category: "profile-recovery",
    excerpt: "What Google's published name guidelines mean for a Business Profile.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-address-and-service-area-rules",
      "google-business-profile-categories",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-address-and-service-area-rules",
    title: "Google Business Profile Address and Service-Area Rules Explained",
    seoTitle: "Google Business Profile Address and Service-Area Rules Explained",
    description:
      "A plain-English explanation of Google Business Profile address and service-area rules.",
    category: "profile-recovery",
    excerpt: "How Google's published address and service-area rules apply to a Business Profile.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-name-rules",
      "google-business-profile-categories",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "google-business-profile-categories",
    title: "Google Business Profile Categories: What You Should and Shouldn't Change",
    seoTitle: "Google Business Profile Categories: What You Should and Shouldn't Change",
    description:
      "A practical explanation of Google Business Profile categories and when changing them is unwise.",
    category: "profile-recovery",
    excerpt: "When a Google Business Profile category change is worth considering — and when it is not.",
    urgent: false,
    relatedResourceSlugs: [
      "google-business-profile-name-rules",
      "google-business-profile-address-and-service-area-rules",
    ],
    commercialRoute: "profile-recovery",
  }),
  draft({
    slug: "false-or-defamatory-google-reviews",
    title: "False or Defamatory Google Reviews: What Google Can — and Can't — Decide",
    seoTitle: "False or Defamatory Google Reviews: What Google Can — and Can't — Decide",
    description:
      "What Google's review policies can address, and what they cannot decide, when a review feels false or defamatory.",
    category: "reviews-reputation",
    excerpt:
      "The difference between Google's published review rules and questions Google does not decide.",
    urgent: false,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "google-rejected-my-review-report",
    ],
    commercialRoute: "review-protection",
  }),
  draft({
    slug: "google-business-profile-scams",
    title: "Google Business Profile Scams: Passwords, OTPs, Fake Calls and Manager Access Requests",
    seoTitle: "Google Business Profile Scams: Passwords, OTPs, Fake Calls and Manager Access Requests",
    description:
      "How to recognise common Google Business Profile access scams involving passwords, codes, fake calls and manager requests.",
    category: "review-abuse-scams",
    excerpt:
      "Common Google Business Profile access scams involving passwords, codes, fake calls and manager requests.",
    urgent: false,
    relatedResourceSlugs: [
      "offered-to-remove-google-reviews-for-money",
      "lost-access-to-google-business-profile",
    ],
    commercialRoute: "review-protection",
  }),
] as const

export type ResourceIndex = {
  all: readonly ResourceRecord[]
  getBySlug: (slug: string) => ResourceRecord | undefined
  getPublishedBySlug: (slug: string) => ResourceRecord | undefined
  published: () => ResourceRecord[]
}

export function createResourceIndex(records: readonly ResourceRecord[]): ResourceIndex {
  const bySlug = new Map(records.map((record) => [record.slug, record]))
  return {
    all: records,
    getBySlug(slug) {
      return bySlug.get(slug)
    },
    getPublishedBySlug(slug) {
      const record = bySlug.get(slug)
      return record?.published ? record : undefined
    },
    published() {
      return records.filter((record) => record.published)
    },
  }
}

export const resources = createResourceIndex(resourceRegistry)

export function getResourceCategory(id: ResourceCategoryId): ResourceCategory {
  const category = resourceCategories.find((item) => item.id === id)
  if (!category) throw new Error(`Unknown resource category: ${id}`)
  return category
}

export function getPublishedResources(index: ResourceIndex = resources): ResourceRecord[] {
  return index.published()
}

export function getPublishedResourceBySlug(
  slug: string,
  index: ResourceIndex = resources,
): ResourceRecord | undefined {
  return index.getPublishedBySlug(slug)
}

export function pickFeaturedResource(published: ResourceRecord[]): ResourceRecord | null {
  return published.find((record) => record.featured) ?? published[0] ?? null
}

export function getFeaturedPublishedResource(
  index: ResourceIndex = resources,
): ResourceRecord | null {
  return pickFeaturedResource(index.published())
}

export function publishedCountForCategory(
  category: ResourceCategoryId,
  index: ResourceIndex = resources,
): number {
  return index.published().filter((record) => record.category === category).length
}

export function relatedPublishedResources(
  resource: ResourceRecord,
  index: ResourceIndex = resources,
): ResourceRecord[] {
  return resource.relatedResourceSlugs
    .map((slug) => index.getPublishedBySlug(slug))
    .filter((record): record is ResourceRecord => Boolean(record))
}

export function resourcePath(slug: string) {
  return `/resources/${slug}`
}

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const
const longMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

function utcDateParts(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return {
    day: date.getUTCDate(),
    monthIndex: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  }
}

export function formatResourceMonthYear(isoDate: string) {
  const { monthIndex, year } = utcDateParts(isoDate)
  return `${shortMonths[monthIndex]} ${year}`
}

export function formatResourceLongDate(isoDate: string) {
  const { day, monthIndex, year } = utcDateParts(isoDate)
  return `${day} ${longMonths[monthIndex]} ${year}`
}

export function resourceShowsUpdated(resource: ResourceRecord) {
  return Boolean(
    resource.dateModified &&
      resource.datePublished &&
      resource.dateModified !== resource.datePublished,
  )
}

export function publishedResourceSitemapEntries(
  index: ResourceIndex = resources,
  siteUrl: string = brandSiteUrl,
): MetadataRoute.Sitemap {
  return index.published().map((resource) => ({
    url: `${siteUrl}${resourcePath(resource.slug)}`,
    lastModified: resource.dateReviewed ?? resource.dateModified ?? resource.datePublished ?? undefined,
  }))
}

/**
 * Suggested urgent callout for the future Review Extortion article.
 * Do not publish as a standalone page, and do not treat every customer
 * dispute as extortion, blackmail, fraud or criminal conduct.
 */
export const reviewExtortionUrgentCallout =
  "If someone is currently demanding money, goods or services in exchange for removing reviews, preserve the messages and review links before taking further action."
