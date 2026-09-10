import type { Metadata } from "next"

/**
 * Page-level Open Graph and Twitter metadata.
 * The social image itself comes from app/opengraph-image.tsx and
 * app/twitter-image.tsx — do not point pages at a static /og-image.png.
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
  }
}
