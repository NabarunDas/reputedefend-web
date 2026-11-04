/**
 * Telloya brand — exact owner-approved 3D Connected T, 2026-11-02.
 *
 * Sculpted emerald and champagne-gold glass T with two gold connection
 * points, a voicewave and the original white Telloya wordmark.
 * No enclosing glass-square tile, headset or chat-bubble symbol.
 * Company operator: ProfileRelaunch Ltd.
 */
export const brandName = "Telloya"
export const brandTagline = "Your AI Receptionist"
export const brandDescriptor = "AI Receptionist by ProfileRelaunch"
export const brandSiteUrl = "https://telloya.com"
export const brandDescription =
  "Capture customer enquiries when you're busy and can't answer the phone. Telloya is your AI receptionist, always ready to help."

export const brandColors = {
  forest: "#10261F",
  green: "#0A6E3C",
  greenDark: "#085330",
  accent: "#009838",
  lime: "#C5E8B4",
  paper: "#F7F8F3",
  muted: "#5D6D66",
  mist: "#A8B8B0", // Added for email template compatibility
} as const

export const brandOperator = "ProfileRelaunch Ltd"
export const operatorSiteUrl = "https://profilerelaunch.com"

// Logo dimensions for email rendering (Connected T lockup approximate dimensions)
export const logoSize = { width: 1932, height: 446 } as const

/** Original design reproduced from user-approved pixels, with transparent mattes. */
export const brandAssets = {
  horizontal: {
    dark: "/brand/telloya-connected-t-lockup.webp",
    light: "/brand/telloya-connected-t-lockup-dark.webp",
    mono: "/brand/telloya-connected-t-lockup.webp",
  },
  mark: {
    dark: "/brand/telloya-connected-t-icon.webp",
    light: "/brand/telloya-connected-t-icon.webp",
    mono: "/brand/telloya-connected-t-icon.webp",
  },
  lockup: {
    dark: "/brand/telloya-connected-t-lockup.webp",
    light: "/brand/telloya-connected-t-lockup-dark.webp",
    mono: "/brand/telloya-connected-t-lockup.webp",
  },
  logo: "/brand/telloya-connected-t-lockup.webp",
  logoDark: "/brand/telloya-connected-t-lockup-dark.webp",
  logoLight: "/brand/telloya-connected-t-lockup.webp",
  favicon: "/brand/telloya-icon-32.png",
  appleTouchIcon: "/brand/telloya-icon-180.png",
} as const

export function pageTitle(page: string) {
  return `${page} | ${brandName}`
}

/**
 * Document title that must not pass through the root `%s | Telloya` template.
 * `pageTitle()` already includes the brand, so a plain string would render
 * as "Page | Telloya | Telloya".
 */
export function absolutePageTitle(page: string) {
  return { absolute: pageTitle(page) } as const
}

export const socialShareImage = {
  url: "/brand/telloya-social-share.webp",
  width: 1200,
  height: 675,
  alt: "Telloya Connected T logo",
} as const

/**
 * Page-level Open Graph and Twitter fields replace the root objects.
 * Repeat the approved share image and large-card type here so a page
 * title does not drop the preview image.
 */
export function pageSocialMetadata(page: { title: string; description: string; path: string }) {
  return {
    openGraph: {
      title: page.title,
      description: page.description,
      url: page.path,
      images: [socialShareImage],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: page.title,
      description: page.description,
      images: [socialShareImage.url],
    },
  }
}

export const defaultTitle = `${brandName} — ${brandTagline}`
export const titleTemplate = `%s | ${brandName}`
export const brandHomeLabel = `${brandName} home`
