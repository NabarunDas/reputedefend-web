import type { Metadata } from "next"
import { pageTitle } from "@/lib/brand"
import { getPublishedResources } from "@/lib/resources"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"
import { resourcesHubSeo } from "./content"
import { ResourcesHub } from "./resources-hub"

const title = pageTitle(resourcesHubSeo.titlePage)
const description = resourcesHubSeo.description

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/resources" },
  openGraph: socialOpenGraph({ title, description, path: "/resources" }),
  twitter: socialTwitter({ title, description }),
}

export default function ResourcesPage() {
  return <ResourcesHub published={getPublishedResources()} />
}
