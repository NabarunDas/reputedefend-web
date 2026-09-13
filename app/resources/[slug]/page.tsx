import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import { getResourceBody } from "@/lib/resource-content"
import { resourceArticleMetadata } from "@/lib/resource-schema"
import { getPublishedResourceBySlug, getPublishedResources } from "@/lib/resources"

type ResourcePageProps = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPublishedResources()
    .filter((resource) => getResourceBody(resource.slug))
    .map((resource) => ({ slug: resource.slug }))
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params
  const resource = getPublishedResourceBySlug(slug)
  const body = getResourceBody(slug)
  if (!resource || !body) notFound()
  return resourceArticleMetadata(resource)
}

export default async function ResourceArticlePage({ params }: ResourcePageProps) {
  const { slug } = await params
  const resource = getPublishedResourceBySlug(slug)
  const body = getResourceBody(slug)
  if (!resource || !body) notFound()
  return <ResourceArticleView resource={resource} body={body} />
}
