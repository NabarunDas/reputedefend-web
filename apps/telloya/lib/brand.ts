/**
 * Brand tokens and approved asset paths for Telloya.
 *
 * Telloya is an AI receptionist service operated by ProfileRelaunch Ltd.
 * It uses the same design system as ProfileRelaunch but with its own
 * brand identity and dedicated domain.
 *
 * The dedicated final Telloya logo will be approved separately and placed
 * in public/brand/ when ready. Until then, the text-based wordmark component
 * serves as the temporary logo.
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

/**
 * Asset paths prepared for the future approved Telloya logo and favicon.
 * Do not commit generated or unapproved placeholder images to these paths.
 */
export const brandAssets = {
  logo: "/brand/telloya-logo.svg",
  logoDark: "/brand/telloya-logo-dark.png",
  logoLight: "/brand/telloya-logo-light.png",
  mark: "/brand/telloya-mark.svg",
  favicon: "/icon.png",
  appleTouchIcon: "/apple-icon.png",
} as const

export function pageTitle(page: string) {
  return `${page} | ${brandName}`
}

export const defaultTitle = `${brandName} — ${brandTagline}`
export const titleTemplate = `%s | ${brandName}`
export const brandHomeLabel = `${brandName} home`
