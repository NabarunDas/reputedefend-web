/**
 * Brand tokens and approved asset paths for ProfileRelaunch.
 *
 * Header, footer and metadata should keep using BrandLogo / BrandMark /
 * these paths. Variants are cropped and recolored from the owner-supplied
 * artwork in public/brand/profile-relaunch-source.png; do not redesign the
 * symbol in code.
 *
 * The horizontal lockup is the site logo (mark + ProfileRelaunch wordmark,
 * without the tagline). The full lockup includes the tagline and is for
 * contexts that can give it enough width. The square mark is for favicon
 * and other compact uses.
 */
export const brandName = "ProfileRelaunch"
export const brandTagline = "Restore visibility. Protect your reputation."
export const brandDescriptor = "Google Business Profile Recovery & Review Protection"
export const brandSiteUrl = "https://profilerelaunch.com"
export const brandDescription =
  "Professional support for Google Business Profile recovery, review protection and reputation monitoring."

export const brandColors = {
  forest: "#10261F",
  green: "#0a6e3c",
  greenDark: "#085330",
  accent: "#009838",
  lime: "#c5e8b4",
  paper: "#f7f8f3",
  muted: "#5d6d66",
  mist: "#A8B8B0",
} as const

export const logoSize = { width: 1932, height: 446 } as const
export const markSize = { width: 512, height: 512 } as const

export type BrandVariant = "dark" | "light" | "mono"
export type BrandLayout = "horizontal" | "mark" | "lockup"

export const brandAssets: Record<BrandLayout, Record<BrandVariant, string>> = {
  horizontal: {
    dark: "/brand/profile-relaunch-logo.png",
    light: "/brand/profile-relaunch-logo-light.png",
    mono: "/brand/profile-relaunch-logo-mono.png",
  },
  mark: {
    dark: "/brand/profile-relaunch-mark.png",
    light: "/brand/profile-relaunch-mark-light.png",
    mono: "/brand/profile-relaunch-mark-mono.png",
  },
  lockup: {
    dark: "/brand/profile-relaunch-lockup.png",
    light: "/brand/profile-relaunch-lockup-light.png",
    mono: "/brand/profile-relaunch-logo-mono.png",
  },
}

export const ogImage = {
  width: 1200,
  height: 630,
  alt: `${brandName} — ${brandDescriptor}.`,
  contentType: "image/png" as const,
}

export const ogCopy = {
  name: brandName,
  headline: brandDescriptor,
  headlineLines: ["Google Business Profile", "Recovery & Review Protection"] as const,
  support: brandTagline,
}

export function pageTitle(page: string) {
  return `${page} | ${brandName}`
}

export const defaultTitle = `${brandName} | ${brandDescriptor}`
export const titleTemplate = `%s | ${brandName}`
export const brandHomeLabel = `${brandName} home`
