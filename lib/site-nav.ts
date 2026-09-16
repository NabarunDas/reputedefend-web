export const serviceNav = [
  { label: "Profile Recovery", href: "/business-profile-recovery" },
  { label: "Review Protection", href: "/review-protection" },
  { label: "Relaunch Guard", href: "/relaunch-guard" },
] as const

export const primaryNav = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
] as const

export const informationNav = [
  { label: "Get Help", href: "/get-help" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "Terms", href: "/terms" },
  { label: "Disclaimer", href: "/disclaimer" },
] as const

export const sitemapPaths = [
  "/",
  "/business-profile-recovery",
  "/review-protection",
  "/relaunch-guard",
  "/how-it-works",
  "/pricing",
  "/about",
  "/resources",
  "/contact",
  "/get-help",
  "/privacy",
  "/cookies",
  "/terms",
  "/disclaimer",
] as const

/**
 * Footer-only destinations. Resources stays out of the primary header until
 * enough guides are published to justify a top-level nav item.
 */
export const footerExploreExtra = [
  { label: "Resources", href: "/resources" },
] as const
