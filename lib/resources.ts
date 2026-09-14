import type { MetadataRoute } from "next"
import { brandSiteUrl } from "@/lib/brand"
import { getResourceBody, type ResourceArticleBody } from "@/lib/resource-content"
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

function draft(partial: Omit<ResourceRecord, "published" | "featured" | "author" | "datePublished" | "dateReviewed" | "dateModified" | "readingMinutes"> & {
  featured?: boolean
}): ResourceRecord {
  return {
    ...partial,
    published: false,
    featured: partial.featured ?? false,
    author: resourceAuthor,
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
  {
    slug: "google-business-profile-suspended-before-appeal",
    title: "Google Business Profile Suspended: What to Do Before You Appeal",
    seoTitle: "Google Business Profile Suspended: What to Do Before You Appeal",
    description:
      "If your Google Business Profile is suspended, do not rush the appeal. Check eligibility, profile accuracy and evidence before using Google's appeals tool.",
    category: "profile-recovery",
    excerpt:
      "A practical pre-appeal guide to checking your profile, preparing evidence and avoiding mistakes that can make a suspension harder to resolve.",
    published: true,
    featured: true,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 10,
    relatedResourceSlugs: [
      "google-business-profile-appeal-evidence-checklist",
      "google-business-profile-appeal-rejected-what-next",
    ],
    commercialRoute: "profile-recovery",
    author: resourceAuthor,
  },
  {
    slug: "google-business-profile-appeal-evidence-checklist",
    title: "Google Business Profile Appeal Evidence Checklist",
    seoTitle: "Google Business Profile Appeal Evidence Checklist",
    description:
      "Preparing a Google Business Profile appeal? Use this evidence checklist to organise the right records before Google's time-limited evidence step.",
    category: "profile-recovery",
    excerpt:
      "A practical checklist for organising relevant business records before you submit a Google Business Profile appeal.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 11,
    relatedResourceSlugs: [
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-rejected-what-next",
    ],
    commercialRoute: "profile-recovery",
    author: resourceAuthor,
  },
  {
    slug: "google-business-profile-appeal-rejected-what-next",
    title: "Google Business Profile Appeal Rejected: What Can You Do Next?",
    seoTitle: "Google Business Profile Appeal Rejected: What Can You Do Next?",
    description:
      "If Google rejected your Business Profile appeal, check the decision, review the underlying policy issue and prepare genuinely useful evidence before requesting additional review.",
    category: "profile-recovery",
    excerpt:
      "What to check after Google does not approve a Business Profile appeal, and how to prepare for the next appropriate review step.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 10,
    relatedResourceSlugs: [
      "google-business-profile-suspended-before-appeal",
      "google-business-profile-appeal-evidence-checklist",
    ],
    commercialRoute: "profile-recovery",
    author: resourceAuthor,
  },
  {
    slug: "google-business-profile-verification-stuck-or-rejected",
    title: "Google Business Profile Verification Stuck or Rejected: What to Check",
    seoTitle: "Google Business Profile Verification Stuck or Rejected: What to Check",
    description:
      "If Google Business Profile verification is stuck or rejected, identify the exact verification state, check the requirements and follow the correct retry or support route.",
    category: "verification-access",
    excerpt:
      "A practical guide to waiting reviews, rejected verification videos, re-verification, missing methods and ownership issues.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 12,
    relatedResourceSlugs: [
      "google-business-profile-suspended-before-appeal",
      "lost-access-to-google-business-profile",
    ],
    commercialRoute: "profile-recovery",
    author: resourceAuthor,
  },
  {
    slug: "can-a-google-review-be-removed",
    title: "Can a Google Review Be Removed? What Google's Policy Actually Allows",
    seoTitle: "Can a Google Review Be Removed? What Google's Policy Actually Allows",
    description:
      "Google does not remove reviews simply because they are negative. Learn which policy violations can qualify for removal, how to report a review and when a one-time appeal is available.",
    category: "reviews-reputation",
    excerpt:
      "A plain-English guide to when Google may remove a review, when it may stay live and how the reporting and appeal process works.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 12,
    relatedResourceSlugs: [
      "fake-google-review-or-genuine-negative-feedback",
      "google-rejected-my-review-report",
    ],
    commercialRoute: "review-protection",
    author: resourceAuthor,
  },
  {
    slug: "fake-google-review-or-genuine-negative-feedback",
    title: "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference",
    seoTitle: "Fake Google Review or Genuine Negative Feedback? How to Tell the Difference",
    description:
      "A suspicious Google review is not automatically fake. Use this evidence-based framework to distinguish possible fake engagement from genuine negative customer feedback.",
    category: "reviews-reputation",
    excerpt:
      "How to assess a suspicious Google review without treating every unfamiliar or critical reviewer as fake.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 11,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "google-review-bombing",
    ],
    commercialRoute: "review-protection",
    author: resourceAuthor,
  },
  {
    slug: "google-review-extortion",
    title: "Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews",
    seoTitle: "Google Review Extortion: What to Do If Someone Demands Money to Remove Reviews",
    description:
      "If someone demands money, goods, services or favours to remove negative Google reviews, do not pay. Preserve the evidence and use Google's dedicated extortion reporting route.",
    category: "review-abuse-scams",
    excerpt:
      "What to preserve and what to do when negative Google reviews are tied to a demand for money, goods, services or favours.",
    published: true,
    featured: false,
    urgent: true,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 11,
    relatedResourceSlugs: [
      "google-review-bombing",
      "customer-threatening-bad-google-review",
      "offered-to-remove-google-reviews-for-money",
    ],
    commercialRoute: "review-protection",
    author: resourceAuthor,
  },
  {
    slug: "google-review-bombing",
    title: "Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once",
    seoTitle: "Google Review Bombing: What to Do When Multiple Suspicious Reviews Arrive at Once",
    description:
      "If several suspicious Google reviews arrive at once, preserve the pattern, assess each review against Google's policies and use the correct reporting and appeal process.",
    category: "review-abuse-scams",
    excerpt:
      "A calm first-response guide when several suspicious Google reviews appear in a short period.",
    published: true,
    featured: false,
    urgent: true,
    datePublished: "2026-09-13",
    dateReviewed: "2026-09-13",
    dateModified: null,
    readingMinutes: 12,
    relatedResourceSlugs: [
      "google-review-extortion",
      "fake-google-review-or-genuine-negative-feedback",
    ],
    commercialRoute: "review-protection",
    author: resourceAuthor,
  },
  {
    slug: "can-a-competitor-or-ex-employee-leave-a-google-review",
    title: "Can a Competitor or Ex-Employee Leave a Google Review?",
    seoTitle: "Can a Competitor or Ex-Employee Leave a Google Review?",
    description:
      "Google's review policies restrict conflicts of interest, including some competitor and current or former employee reviews. Learn what evidence matters and how to report them.",
    category: "reviews-reputation",
    excerpt:
      "How Google's conflict-of-interest rules apply to reviews from competitors, current or former employees and other professionally connected people.",
    published: true,
    featured: false,
    urgent: false,
    datePublished: "2026-09-14",
    dateReviewed: "2026-09-14",
    dateModified: null,
    readingMinutes: 11,
    relatedResourceSlugs: [
      "can-a-google-review-be-removed",
      "false-or-defamatory-google-reviews",
    ],
    commercialRoute: "review-protection",
    author: resourceAuthor,
  },
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

export type ResourceBodyLookup = (slug: string) => Pick<ResourceArticleBody, "sourcesUsed"> | undefined

export type ResourceIndex = {
  all: readonly ResourceRecord[]
  getBySlug: (slug: string) => ResourceRecord | undefined
  getPublishedBySlug: (slug: string) => ResourceRecord | undefined
  published: () => ResourceRecord[]
}

const ISO_CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A public Resource date must be a real calendar day in YYYY-MM-DD form.
 * Shape alone is not enough: 2026-02-30 and 2026-13-13 are invalid.
 */
export function isResourceCalendarDate(value: string | null): value is string {
  if (typeof value !== "string") return false
  const match = ISO_CALENDAR_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const utc = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(utc.getTime())) return false
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

/**
 * Single definition of a resource that is safe to expose publicly.
 * `published: true` is not enough on its own.
 */
export function isPublicResource(
  record: ResourceRecord,
  body: Pick<ResourceArticleBody, "sourcesUsed"> | undefined,
): boolean {
  return (
    record.published === true &&
    Boolean(body) &&
    isResourceCalendarDate(record.datePublished) &&
    isResourceCalendarDate(record.dateReviewed) &&
    typeof record.readingMinutes === "number" &&
    record.readingMinutes > 0 &&
    Array.isArray(body?.sourcesUsed) &&
    body.sourcesUsed.length > 0
  )
}

export function createResourceIndex(
  records: readonly ResourceRecord[],
  getBody: ResourceBodyLookup = getResourceBody,
): ResourceIndex {
  const bySlug = new Map(records.map((record) => [record.slug, record]))
  function isPublic(record: ResourceRecord) {
    return isPublicResource(record, getBody(record.slug))
  }
  return {
    all: records,
    getBySlug(slug) {
      return bySlug.get(slug)
    },
    getPublishedBySlug(slug) {
      const record = bySlug.get(slug)
      return record && isPublic(record) ? record : undefined
    },
    published() {
      return records.filter(isPublic)
    },
  }
}

export const resources = createResourceIndex(resourceRegistry, getResourceBody)

const unsafePublished = resourceRegistry.filter(
  (record) => record.published && !isPublicResource(record, getResourceBody(record.slug)),
)
if (unsafePublished.length > 0) {
  throw new Error(
    `Invalid resource publication state: ${unsafePublished.map((record) => record.slug).join(", ")} ${
      unsafePublished.length === 1 ? "is" : "are"
    } marked published without a complete public article.`,
  )
}

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

export function getPublishedResourceArticle(slug: string) {
  const resource = getPublishedResourceBySlug(slug)
  const body = getResourceBody(slug)
  if (!resource || !body) return undefined
  return { resource, body }
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
