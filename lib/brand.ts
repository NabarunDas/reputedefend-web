/**
 * Brand tokens and approved asset paths for ReputeDefend.
 *
 * Header, footer and metadata should keep using ReputeLogo / ReputeMark /
 * these paths. Replace the files under /public/brand when a vector original
 * is supplied; do not redesign the symbol in code, and do not restructure
 * header/footer.
 *
 * The horizontal lockup is the site logo (mark + ReputeDefend). The square
 * mark is for favicon and other compact uses.
 */
export const brandColors = {
  forest: "#10261F",
  green: "#0b6b52",
  greenDark: "#084d3d",
  lime: "#cbe86b",
  paper: "#f7f8f3",
  muted: "#5d6d66",
  mist: "#A8B8B0",
} as const

export const brandName = "ReputeDefend"

export const logoSize = { width: 1456, height: 300 } as const
export const markSize = { width: 256, height: 256 } as const

export type BrandVariant = "dark" | "light" | "mono"
export type BrandLayout = "horizontal" | "mark"

export const brandAssets: Record<BrandLayout, Record<BrandVariant, string>> = {
  horizontal: {
    dark: "/brand/logo-horizontal-dark.png",
    light: "/brand/logo-horizontal-light.png",
    mono: "/brand/logo-horizontal-mono.png",
  },
  mark: {
    dark: "/brand/mark-dark.png",
    light: "/brand/mark-light.png",
    mono: "/brand/mark-mono.png",
  },
}

export const ogImage = {
  width: 1200,
  height: 630,
  alt: "ReputeDefend — Google Business Profile recovery and review protection support.",
  contentType: "image/png" as const,
}

export const ogCopy = {
  name: brandName,
  headline: "Protect your business presence and reputation on Google.",
  support: "Human review • Evidence-led • Clear next steps",
}
