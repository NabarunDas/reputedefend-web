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
} as const

export const brandOperator = "ProfileRelaunch Ltd"
export const operatorSiteUrl = "https://profilerelaunch.com"

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

export const defaultTitle = `${brandName} — ${brandTagline}`
export const titleTemplate = `%s | ${brandName}`
export const brandHomeLabel = `${brandName} home`
