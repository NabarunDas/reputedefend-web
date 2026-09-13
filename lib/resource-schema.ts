import type { Metadata } from "next"
import { brandName } from "@/lib/brand"
import { organizationUrl } from "@/lib/organization-schema"
import { resourcePath, type ResourceRecord } from "@/lib/resources"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

export function resourceArticleMetadata(resource: ResourceRecord): Metadata {
  const title = `${resource.seoTitle} | ${brandName}`
  const description = resource.description
  const path = resourcePath(resource.slug)
  const publishedTime = resource.datePublished ?? undefined
  const modifiedTime = resource.dateReviewed ?? resource.dateModified ?? resource.datePublished ?? undefined

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: {
      ...socialOpenGraph({ title, description, path }),
      type: "article",
      publishedTime,
      modifiedTime,
      authors: [resource.author],
    },
    twitter: socialTwitter({ title, description }),
  }
}

export function resourceArticleJsonLd(resource: ResourceRecord) {
  const url = organizationUrl()
  const pageUrl = `${url}${resourcePath(resource.slug)}`
  const datePublished = resource.datePublished
  const dateModified = resource.dateReviewed ?? resource.dateModified ?? resource.datePublished

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: resource.title,
    description: resource.description,
    datePublished,
    dateModified,
    author: {
      "@type": "Organization",
      name: resource.author,
      url,
    },
    publisher: {
      "@type": "Organization",
      name: brandName,
      url,
      logo: {
        "@type": "ImageObject",
        url: `${url}/icon.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    url: pageUrl,
  }
}

export function resourceBreadcrumbJsonLd(resource: ResourceRecord, categoryTitle: string) {
  const url = organizationUrl()
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Resources",
        item: `${url}/resources`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryTitle,
        item: `${url}/resources#category-${resource.category}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: resource.title,
        item: `${url}${resourcePath(resource.slug)}`,
      },
    ],
  }
}
