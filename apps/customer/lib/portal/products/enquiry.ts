import { brandSiteUrl } from "../../../../../lib/brand"
import { legalIdentity } from "../../../../../lib/legal"

/** Existing ProfileRelaunch assessment form. Not a checkout. */
export const profileRelaunchEnquiryHref = `${brandSiteUrl}/get-help`

/**
 * Telloya's online enquiry form is not live: the current route answers 503.
 * This is the published contact address, not a new enquiry pipeline.
 */
export const telloyaContactHref = legalIdentity.contactEmail
  ? `mailto:${legalIdentity.contactEmail}`
  : null

export const requestAccessAction = {
  recovery: { label: "Start an assessment", href: profileRelaunchEnquiryHref },
  guard: { label: "Enquire about Relaunch Guard", href: profileRelaunchEnquiryHref },
  telloya: telloyaContactHref
    ? { label: "Email us about Telloya", href: telloyaContactHref }
    : null,
} as const
