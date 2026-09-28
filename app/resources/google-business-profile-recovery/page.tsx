import type { Metadata } from "next"
import { ResourceCategoryHubView } from "@/components/resources/resource-category-hub"
import { resourceCategoryHubMetadata } from "@/lib/resource-schema"
import { getPublishedResources } from "@/lib/resources"
import { getResourceCategoryHub } from "../category-hub-content"

const hub = getResourceCategoryHub("profile-recovery")

export const metadata: Metadata = resourceCategoryHubMetadata({
  seoTitle: hub.seoTitle,
  description: hub.description,
  path: hub.path,
})

export default function ProfileRecoveryResourceHubPage() {
  return (
    <ResourceCategoryHubView
      hub={hub}
      resources={getPublishedResources().filter((resource) => resource.category === hub.category)}
    />
  )
}
