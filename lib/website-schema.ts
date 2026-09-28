import { brandName } from "@/lib/brand"
import { organizationUrl } from "@/lib/organization-schema"

export type WebsiteSchema = {
  "@context": "https://schema.org"
  "@type": "WebSite"
  name: string
  alternateName: string
  url: string
}

/**
 * WebSite identity for the homepage only.
 *
 * Deliberately carries no SearchAction / potentialAction: ProfileRelaunch has
 * no public site-search feature, so advertising one would describe something
 * that does not exist.
 */
export function websiteSchema(): WebsiteSchema {
  const url = organizationUrl()
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brandName,
    alternateName: new URL(url).host,
    url: `${url.replace(/\/+$/, "")}/`,
  }
}
