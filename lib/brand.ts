/**
 * Brand tokens and temporary asset paths for ReputeDefend.
 *
 * The current mark and wordmark are TEMPORARY. Header, footer and metadata
 * should keep using ReputeLogo / ReputeMark / these paths. When the approved
 * logo is supplied, replace the files under /public/brand and app/icon.svg —
 * do not redesign the symbol in code, and do not restructure header/footer.
 *
 * TODO(brand): approved horizontal logo (dark, light, mono)
 * TODO(brand): approved icon/mark (dark, light, mono, favicon, apple PNG)
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

export const logoSize = { width: 280, height: 64 } as const
export const markSize = { width: 64, height: 64 } as const

export type BrandVariant = "dark" | "light" | "mono"
export type BrandLayout = "horizontal" | "mark"

export const brandAssets: Record<BrandLayout, Record<BrandVariant, string>> = {
  horizontal: {
    dark: "/brand/logo-horizontal-dark.svg",
    light: "/brand/logo-horizontal-light.svg",
    mono: "/brand/logo-horizontal-mono.svg",
  },
  mark: {
    dark: "/brand/mark-dark.svg",
    light: "/brand/mark-light.svg",
    mono: "/brand/mark-mono.svg",
  },
}

export const ogImage = {
  width: 1200,
  height: 630,
  alt: "ReputeDefend. Protect your business presence and reputation on Google. Independent, evidence-led, no guaranteed outcomes.",
  contentType: "image/png" as const,
}

export const ogCopy = {
  name: brandName,
  headline: "Protect your business presence and reputation on Google.",
  support: "Independent • Evidence-led • No guaranteed outcomes",
}
