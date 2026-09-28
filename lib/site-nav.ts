import { resourceCategoryHubPaths } from "@/lib/resource-category-links"

export const serviceNav = [
  { label: "Profile Recovery", href: "/business-profile-recovery" },
  { label: "Review Protection", href: "/review-protection" },
  { label: "Relaunch Guard", href: "/relaunch-guard" },
] as const

export const primaryNav = [
  { label: "How It Works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
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
  ...resourceCategoryHubPaths,
  "/contact",
  "/get-help",
  "/privacy",
  "/cookies",
  "/terms",
  "/disclaimer",
] as const

/**
 * Footer-only destinations. Resources now ships in primaryNav, which Footer
 * already renders, so it must not be repeated here.
 */
export const footerExploreExtra = [] as const
