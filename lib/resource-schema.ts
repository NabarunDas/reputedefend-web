import type { Metadata } from "next"
import { brandName, pageTitle } from "@/lib/brand"
import { organizationUrl } from "@/lib/organization-schema"
import { RESOURCES_INDEX_PATH, resourceCategoryLinkPath } from "@/lib/resource-category-links"
import {
  isResourceCalendarDate,
  resourceLastModifiedDate,
  resourcePath,
  type ResourceRecord,
} from "@/lib/resources"
import { socialOpenGraph, socialTwitter } from "@/lib/social-metadata"

/** Canonical metadata for a Resource topic hub. */
export function resourceCategoryHubMetadata({
  seoTitle,
  description,
  path,
}: {
  seoTitle: string
  description: string
  path: string
}): Metadata {
  const title = pageTitle(seoTitle)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: socialOpenGraph({ title, description, path }),
    twitter: socialTwitter({ title, description }),
  }
}

/**
 * BreadcrumbList for a Resource topic hub. `title` must be the label the hub
 * shows as its current breadcrumb step so the markup matches what a visitor
 * can see.
 */
export function resourceCategoryHubBreadcrumbJsonLd({
  title,
  path,
}: {
  title: string
  path: string
}) {
  const url = organizationUrl()
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Resources",
        item: `${url}${RESOURCES_INDEX_PATH}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: title,
        item: `${url}${path}`,
      },
    ],
  }
}

export function resourceArticleMetadata(resource: ResourceRecord): Metadata {
  if (!isResourceCalendarDate(resource.datePublished) || !isResourceCalendarDate(resource.dateReviewed)) {
    throw new Error(`Cannot emit article metadata without publication dates for ${resource.slug}`)
  }

  const title = `${resource.seoTitle} | ${brandName}`
  const description = resource.description
  const path = resourcePath(resource.slug)
  const publishedTime = resource.datePublished
  const modifiedTime = resourceLastModifiedDate(resource) ?? resource.datePublished

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
  if (!isResourceCalendarDate(resource.datePublished) || !isResourceCalendarDate(resource.dateReviewed)) {
    throw new Error(`Cannot emit Article JSON-LD without publication dates for ${resource.slug}`)
  }

  const url = organizationUrl()
  const pageUrl = `${url}${resourcePath(resource.slug)}`
  const datePublished = resource.datePublished
  const dateModified = resourceLastModifiedDate(resource) ?? resource.datePublished

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
        item: `${url}${resourceCategoryLinkPath(resource.category)}`,
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
