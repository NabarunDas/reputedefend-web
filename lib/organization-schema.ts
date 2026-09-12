import { brandDescription, brandName, brandSiteUrl } from "@/lib/brand"
import { hasLegalValue, legalIdentity } from "@/lib/legal"

export type OrganizationSchema = {
  "@context": "https://schema.org"
  "@type": "Organization"
  name: string
  url: string
  logo: string
  description: string
  email?: string
  legalName?: string
  address?: {
    "@type": "PostalAddress"
    streetAddress: string
    addressLocality: string
    postalCode: string
    addressCountry: string
  }
}

export function organizationUrl() {
  return legalIdentity.siteUrl || brandSiteUrl
}

function organizationAddress() {
  if (!hasLegalValue(legalIdentity.postalAddress)) return undefined
  const lines = legalIdentity.postalAddress.split("\n").map((line) => line.trim()).filter(Boolean)
  const country = lines.at(-1)
  const postalCode = lines.at(-2)
  const locality = lines.at(-3)
  const street = lines.slice(0, -3).join(", ")
  if (!street || !locality || !postalCode || !country) return undefined
  return {
    "@type": "PostalAddress" as const,
    streetAddress: street,
    addressLocality: locality,
    postalCode,
    addressCountry: country === "United Kingdom" ? "GB" : country,
  }
}

export function organizationSchema(): OrganizationSchema {
  const url = organizationUrl()
  const schema: OrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brandName,
    url,
    logo: `${url}/icon.png`,
    description: brandDescription,
  }

  if (hasLegalValue(legalIdentity.legalName)) schema.legalName = legalIdentity.legalName
  if (hasLegalValue(legalIdentity.contactEmail)) schema.email = legalIdentity.contactEmail
  const address = organizationAddress()
  if (address) schema.address = address
  return schema
}

export function serviceSchema({
  name,
  description,
  path,
}: {
  name: string
  description: string
  path: string
}) {
  const url = organizationUrl()
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    url: `${url}${path}`,
    provider: {
      "@type": "Organization",
      name: brandName,
      url,
    },
  }
}
