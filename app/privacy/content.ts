import { brandName } from "@/lib/brand"

export const privacySeo = {
  titlePage: "Privacy notice",
  description:
    "How ProfileRelaunch handles information submitted through this website, including general enquiries, case-intake submissions and optional analytics consent.",
} as const

export const privacyHero = {
  eyebrow: "Privacy",
  title: "Privacy notice",
  lead: `This notice describes the information visitors may submit through ${brandName}, optional analytics if it is configured, and the limits of what this website collects.`,
} as const

export const privacyCovers = [
  "This notice explains how information is handled on this website. It reflects the current site: public information pages, enquiry forms, optional analytics if configured, and a cookie preference. It is not an account product, a customer dashboard or a payment system.",
  "Submitting a form does not, by itself, create a client or paid-service relationship. Any later support, and any associated fees, are explained before you decide how to proceed.",
] as const

export const privacyHomepageFields = [
  "your name",
  "email address",
  "optional business name",
  "the type of help you select",
  "a description of what happened or what you need",
] as const

export const privacyContactFields = [
  "your name",
  "email address",
  "optional business name",
  "a subject, such as a general question, service question, partnership or media enquiry",
  "your message",
] as const

export const privacyCaseFields = [
  "the type of help needed",
  "your name and email address",
  "optional phone number",
  "business name and country",
  "optional website, Business Profile or review URLs",
  "an account of what happened, including dates, messages or steps already taken",
  "confirmation that the information is accurate to the best of your knowledge",
  "confirmation that you have read this privacy information",
] as const

export const privacyUses = [
  "respond to an enquiry",
  "assess a case you have asked us to look at",
  "communicate about requested support",
  "ask for clarification where the information is incomplete",
  "maintain reasonable security and reduce automated or abusive submissions",
] as const

export const privacyAnalytics = [
  "This website may use Google Analytics 4 if a measurement ID is configured. Analytics is optional. It stays off until you accept it through the cookie banner or Cookie settings. Continued browsing is not treated as consent.",
  "If you accept analytics, Google acts as the analytics provider and may process usage and technical information to measure how the public website is used. We use that to improve the site. ProfileRelaunch does not use analytics for advertising.",
  "We do not send names, emails, phone numbers, business names, form answers, Business Profile URLs, review URLs, evidence or other case contents to Google Analytics. Page measurement uses the page path, not query strings.",
  "Analytics information is not described here as anonymous. Google may process technical information, which can include IP address, as part of providing the service. We have not independently verified every Google-side processing detail.",
  "You can reject analytics or withdraw a previous acceptance through Cookie settings. Withdrawal stops future measurement from this website. It does not delete information Google may already have received.",
  "If analytics is not configured, no Google Analytics script is loaded and no analytics cookies are set.",
] as const

export const privacyMarketing =
  "No marketing email consent is collected on this website. The accuracy and privacy confirmations on Get Help record that you have checked the information and have read this notice. They are not marketing consent. There is no newsletter signup."

export const privacyNoUpload =
  "This website does not currently provide file or screenshot upload. Do not treat the enquiry forms as a document portal."

export const privacyNoPayment =
  "This website does not collect payments, create an account or provide a customer login. We do not sell the information you submit. We do not use submitted enquiry or case information for advertising or profiling."
