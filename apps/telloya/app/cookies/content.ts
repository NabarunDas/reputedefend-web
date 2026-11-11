import { brandName, brandOperator, operatorSiteUrl } from "@/lib/brand"

export const operatorPrivacyHref = `${operatorSiteUrl}/privacy`

export const cookiesSeo = {
  title: "Cookies and analytics",
  description:
    "How Telloya uses necessary storage and optional Google Analytics. Analytics is off until you accept it, is not used for advertising, and can be withdrawn from Cookie settings.",
} as const

export const cookiesHero = {
  eyebrow: "Cookies",
  title: "Cookies and analytics",
  lead:
    "This page explains the storage this Telloya website uses, when optional analytics may run, and how to accept, reject or change that choice.",
} as const

export const cookiesIntro = [
  `${brandName} is operated by ${brandOperator}. This notice covers the Telloya marketing website only. It is not the operator's company-wide privacy notice, and it does not set the rules for Telloya voice services.`,
  "Some technologies store or access information on your device so a website can work or remember a choice you have made. Analytics is optional and stays off until you accept it.",
] as const

export const cookiesNecessary = {
  title: "Necessary storage",
  paragraphs: [
    "Necessary storage is used for basic site operation and for remembering your analytics choice. This category stays on because the site needs it to remember whether analytics was accepted or rejected.",
    "That choice is stored in this browser under the name telloya:analytics-consent:v1. It records only accepted or rejected. It does not store your name, email, phone number, business, website, enquiry answers or enquiry reference.",
    "This Telloya preference is stored separately from any analytics choice you make on the ProfileRelaunch website.",
  ],
} as const

export const cookiesAnalytics = {
  title: "Optional Google Analytics",
  paragraphs: [
    "Telloya can use its own Google Analytics 4 property when a Telloya measurement ID is configured. If that ID is missing or invalid, no Google Analytics script is loaded and no analytics cookies are set.",
    "When analytics is configured, it stays off until you explicitly accept it. Browsing the site is not treated as consent. Telloya does not send analytics requests to Google before that choice.",
    "After you accept, Google Analytics may set first-party cookies on this host, commonly including names beginning _ga. Those cookies are limited to this website rather than shared with ProfileRelaunch. Telloya does not publish an exhaustive cookie list or exact lifetimes here, because those details depend on the configured Google property.",
    "Analytics is used to understand how the public Telloya website is used. Telloya does not use it for advertising, remarketing, ad personalisation or Google Signals.",
    "Page measurement uses the page path only. Query strings and fragments are not sent. Enquiry form values, email addresses, phone numbers, business names, website addresses and customer reference numbers are not sent to Google Analytics.",
  ],
} as const

export const cookiesChoice = {
  title: "Accept, reject or withdraw",
  paragraphs: [
    "If analytics is configured, Accept and Reject are both available before anything is measured. You can also open Settings. The site remains usable if you reject analytics.",
    "You can change or withdraw that choice later from Cookie settings in the footer. Switching analytics off stops further measurement and Telloya attempts to remove first-party Google Analytics cookies from this site. Information Google may already have received before withdrawal is not deleted by that step.",
    "Advertising consent stays denied whether analytics is on or off.",
  ],
} as const

export const cookiesOperator = {
  title: "The operator's privacy notice",
  paragraphs: [
    `${brandOperator}'s company-wide privacy notice remains the notice for the ProfileRelaunch website. The Telloya privacy notice explains enquiries on this website and is a draft for legal review.`,
    "Telloya-specific terms for AI voice services, call recording, transcripts, automatic deletion, cancellation and refunds are not confirmed as a paid-service agreement. They are awaiting approval and will be published before public launch.",
  ],
} as const
