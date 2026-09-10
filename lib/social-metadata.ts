import type { Metadata } from "next"
import { ogImage } from "@/lib/brand"

const socialImage = {
  url: "/opengraph-image",
  width: ogImage.width,
  height: ogImage.height,
  alt: ogImage.alt,
  type: ogImage.contentType,
}

/**
 * Page-level Open Graph and Twitter metadata.
 * Images point at the generated App Router routes, not a static PNG.
 */
export function socialOpenGraph({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: "ReputeDefend",
    title,
    description,
    url: path,
    images: [socialImage],
  }
}

export function socialTwitter({
  title,
  description,
}: {
  title: string
  description: string
}): NonNullable<Metadata["twitter"]> {
  return {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: "/twitter-image", width: ogImage.width, height: ogImage.height, alt: ogImage.alt }],
  }
}
