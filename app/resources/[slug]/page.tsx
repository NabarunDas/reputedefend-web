import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ResourceArticleView } from "@/components/resources/resource-article-view"
import { resourceArticleMetadata } from "@/lib/resource-schema"
import { getPublishedResourceArticle, getPublishedResources } from "@/lib/resources"

type ResourcePageProps = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPublishedResources().map((resource) => ({ slug: resource.slug }))
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params
  const article = getPublishedResourceArticle(slug)
  if (!article) notFound()
  return resourceArticleMetadata(article.resource)
}

export default async function ResourceArticlePage({ params }: ResourcePageProps) {
  const { slug } = await params
  const article = getPublishedResourceArticle(slug)
  if (!article) notFound()
  return <ResourceArticleView resource={article.resource} body={article.body} />
}
