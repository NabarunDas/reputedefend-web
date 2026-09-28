import type { Metadata } from "next"
import { ResourceCategoryHubView } from "@/components/resources/resource-category-hub"
import { resourceCategoryHubMetadata } from "@/lib/resource-schema"
import { getPublishedResources } from "@/lib/resources"
import { getResourceCategoryHub } from "../category-hub-content"

const hub = getResourceCategoryHub("verification-access")

export const metadata: Metadata = resourceCategoryHubMetadata({
  seoTitle: hub.seoTitle,
  description: hub.description,
  path: hub.path,
})

export default function VerificationAccessResourceHubPage() {
  return (
    <ResourceCategoryHubView
      hub={hub}
      resources={getPublishedResources().filter((resource) => resource.category === hub.category)}
    />
  )
}
