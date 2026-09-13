import { brandName } from "@/lib/brand"

export const cookiesPrivacyHref = "/privacy"

export const cookiesSeo = {
  titlePage: "Cookies and analytics",
  description:
    "How ProfileRelaunch uses necessary site storage and optional Google Analytics. Analytics is off until you accept it, is not used for advertising, and can be changed in Cookie settings.",
} as const

export const cookiesHero = {
  eyebrow: "Cookies",
  title: "Cookies and analytics",
  lead:
    "This notice explains the storage this website uses, when optional analytics may run, and how to accept, reject or change that choice.",
} as const

export const cookiesIntro = [
  "Some technologies store or access information on your device so a website can work, stay secure, or remember a choice you have made. This page describes what ProfileRelaunch actually uses today.",
  `${brandName} is a UK-based independent business supporting businesses internationally. Privacy and cookie rules can differ by location. We use one privacy-respecting consent model for optional analytics rather than a country-by-country set of tracking rules.`,
] as const

export const cookiesNecessary = {
  title: "Necessary storage",
  paragraphs: [
    "Necessary storage is used for basic site operation, security, and remembering your analytics choice where that is required. This category is always active because the website cannot function as a public information and enquiry site without it.",
    "The analytics preference is stored in your browser as a small first-party value named profilerelaunch:analytics-consent:v1. It records only whether analytics was accepted or rejected. It does not store your name, email, business, case type, profile URL, review URL or assessment details.",
  ],
} as const

export const cookiesAnalytics = {
  title: "Optional Google Analytics",
  paragraphs: [
    "This website can use Google Analytics 4 if a measurement ID is configured. If it is not configured, no Google Analytics script is loaded and no analytics cookies are set.",
    "If analytics is configured, it stays off until you explicitly accept it. Continued browsing is not treated as consent. We do not send cookieless analytics pings to Google before that choice.",
    "After you accept, Google Analytics may set first-party cookies, commonly including names beginning _ga. Those cookies help Google measure public-site usage. We do not publish an exhaustive cookie list or exact lifetimes here, because those details depend on the configured Google property and have not been independently verified in this notice.",
    "Analytics is used to understand how the public website is used and to improve the site. ProfileRelaunch does not use it for advertising, retargeting, personalisation products, session replay or heatmaps.",
    "We do not send names, emails, phone numbers, business names, form answers, Business Profile URLs, review URLs, evidence or other case contents to Google Analytics. Page measurement uses the page path only, not query strings or fragments.",
    "Google acts as the analytics provider if analytics is enabled. ProfileRelaunch does not control every Google-side retention rule.",
  ],
} as const

export const cookiesChoice = {
  title: "Accept, reject or change your choice",
  paragraphs: [
    "If analytics is configured, you can accept it, reject it, or open Settings. Reject is as available as Accept. The site remains fully usable if you reject analytics.",
    "You can change your choice later through Cookie settings in the footer. If you switch analytics off after accepting it, future measurement stops and we attempt to remove first-party Google Analytics cookies from this site. That does not delete information Google may already have received before you withdrew consent.",
  ],
} as const
