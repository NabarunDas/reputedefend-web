import { brandSiteUrl } from "../../../../../lib/brand"

/** Existing ProfileRelaunch assessment form. Not a checkout. */
export const profileRelaunchEnquiryHref = `${brandSiteUrl}/get-help`

/** Existing Telloya enquiry form. Not a customer workspace. */
export const telloyaEnquiryHref = "https://telloya.com/enquire"

export const requestAccessAction = {
  profile: { label: "Request access", href: profileRelaunchEnquiryHref },
  telloya: { label: "Request access", href: telloyaEnquiryHref },
} as const
