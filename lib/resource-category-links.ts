import type { ResourceCategoryId } from "@/lib/resources"

/**
 * Crawlable topic hubs for Resource categories.
 *
 * A category only belongs here once it has a real published hub page. Google
 * Policy Updates is deliberately absent: it has no substantive published
 * content yet, so anything that needs a hub URL must fall back to /resources
 * rather than link to a page that does not exist.
 */
export const resourceCategoryHubs = {
  "profile-recovery": "/resources/google-business-profile-recovery",
  "verification-access": "/resources/google-business-profile-verification-access",
  "reviews-reputation": "/resources/google-reviews",
  "review-abuse-scams": "/resources/google-review-abuse-scams",
} as const satisfies Partial<Record<ResourceCategoryId, string>>

export type ResourceCategoryHubId = keyof typeof resourceCategoryHubs
export type ResourceCategoryHubPath = (typeof resourceCategoryHubs)[ResourceCategoryHubId]

export const RESOURCES_INDEX_PATH = "/resources" as const

/** Every hub path, in Resource category order. */
export const resourceCategoryHubPaths = [
  resourceCategoryHubs["profile-recovery"],
  resourceCategoryHubs["verification-access"],
  resourceCategoryHubs["reviews-reputation"],
  resourceCategoryHubs["review-abuse-scams"],
] as const

export function hasResourceCategoryHub(
  category: ResourceCategoryId,
): category is ResourceCategoryHubId {
  return category in resourceCategoryHubs
}

/** The hub URL for a category, or null when that category has no hub. */
export function resourceCategoryHubPath(category: ResourceCategoryId): ResourceCategoryHubPath | null {
  return hasResourceCategoryHub(category) ? resourceCategoryHubs[category] : null
}

/**
 * Hub URL for breadcrumbs and other navigation that must always resolve:
 * categories without a hub point at the Resources index instead.
 */
export function resourceCategoryLinkPath(
  category: ResourceCategoryId,
): ResourceCategoryHubPath | typeof RESOURCES_INDEX_PATH {
  return resourceCategoryHubPath(category) ?? RESOURCES_INDEX_PATH
}
