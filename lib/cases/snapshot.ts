import type { EnquiryInput } from "@/lib/enquiry"

export type IntakeSnapshot = {
  service: EnquiryInput["service"]
  fullName: string
  email: string
  businessName: string
  country: string
  phone: string
  websiteUrl: string
  businessProfileUrl: string
  reviewUrl: string
  details: string
  informationAccurate: boolean
  privacyAccepted: boolean
  source: EnquiryInput["source"]
}

export function buildIntakeSnapshot(data: EnquiryInput): IntakeSnapshot {
  return {
    service: data.service,
    fullName: data.fullName,
    email: data.email,
    businessName: data.businessName,
    country: data.country,
    phone: data.phone,
    websiteUrl: data.websiteUrl,
    businessProfileUrl: data.businessProfileUrl,
    reviewUrl: data.reviewUrl,
    details: data.details,
    informationAccurate: data.informationAccurate,
    privacyAccepted: data.privacyAccepted,
    source: data.source,
  }
}
