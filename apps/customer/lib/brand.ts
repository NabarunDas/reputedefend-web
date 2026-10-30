/**
 * Customer-app brand values. The marketing site is the visual authority.
 * Do not import marketing runtime modules; this app deploys on its own.
 */
export const brandName = "ProfileRelaunch"

export const brandTagline = "Restore visibility. Protect your reputation."

export const marketingOrigin = "https://profilerelaunch.com"

export const brandLogoDark = "/brand/profile-relaunch-logo.png"

export const brandLogoLight = "/brand/profile-relaunch-logo-light.png"

export const brandIcon = "/icon.png"

export const brandAppleIcon = "/apple-icon.png"

/** Natural pixel size of the approved horizontal lockup. */
export const logoSize = { width: 1932, height: 446 } as const

/**
 * Display width of `.customer-header .customer-logo`: `clamp(136px, 36vw, 208px)`.
 * 36vw reaches 136px at 378px and 208px at 578px, so the image slot matches
 * those breakpoints instead of assuming 160px below 768px.
 */
export const customerHeaderLogoSizes = "(max-width: 377px) 136px, (max-width: 577px) 36vw, 208px"

export const marketingHomeLabel = `${brandName} home`
