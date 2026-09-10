export const ENQUIRY_SOURCES = ["homepage", "contact", "get-help"] as const
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number]

export const CASE_SERVICES = [
  {
    value: "profile-recovery",
    query: "profile",
    label: "Business Profile Recovery",
    description: "A suspended, restricted or disabled Google Business Profile.",
  },
  {
    value: "profile-access",
    query: "access",
    label: "Business Profile / Verification / Access issue",
    description: "Problems with verification, ownership or access to the profile.",
  },
  {
    value: "review-protection",
    query: "review",
    label: "Review Protection",
    description: "A suspicious or potentially policy-violating review that needs a careful look.",
  },
  {
    value: "general",
    query: "general",
    label: "General / not sure",
    description: "Another reputation issue, or you are still working out what happened.",
  },
] as const

export type CaseService = (typeof CASE_SERVICES)[number]["value"]

export const GENERAL_SERVICE_OPTIONS = [
  { value: "profile-recovery", label: "Business Profile recovery" },
  { value: "review-protection", label: "Review issue" },
  { value: "general", label: "Something else" },
] as const

export const CONTACT_SUBJECTS = [
  { value: "general-question", label: "General question" },
  { value: "service-question", label: "Service question" },
  { value: "partnership", label: "Partnership / business enquiry" },
  { value: "media", label: "Media / professional enquiry" },
  { value: "something-else", label: "Something else" },
] as const

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number]["value"]

export const enquiryLimits = {
  fullName: 100,
  email: 254,
  businessName: 160,
  country: 80,
  phone: 40,
  service: 64,
  subject: 64,
  websiteUrl: 1000,
  businessProfileUrl: 1000,
  reviewUrl: 1000,
  details: 5000,
  source: 32,
} as const

export type EnquiryInput = {
  fullName: string
  email: string
  businessName: string
  country: string
  phone: string
  service: CaseService | ""
  subject: string
  websiteUrl: string
  businessProfileUrl: string
  reviewUrl: string
  details: string
  informationAccurate: boolean
  privacyAccepted: boolean
  source: EnquirySource
}

export type EnquiryField = keyof EnquiryInput
export type EnquiryFieldErrors = Partial<Record<EnquiryField, string>>

export type EnquiryValidation =
  | { valid: true; data: EnquiryInput }
  | { valid: false; error: string; errors?: EnquiryFieldErrors }

export type EnquiryResult = {
  ok: boolean
  message: string
  simulated?: boolean
}

const PROCESS_ERROR = "Unable to process this enquiry."
const STRING_FIELDS = [
  "fullName",
  "email",
  "businessName",
  "country",
  "phone",
  "service",
  "subject",
  "websiteUrl",
  "businessProfileUrl",
  "reviewUrl",
  "details",
  "source",
  "companyFax",
] as const
const BOOLEAN_FIELDS = ["informationAccurate", "privacyAccepted"] as const
const PHONE_PATTERN = /^[+]?[\d\s().-]{7,}$/
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function normalizeEnquiryText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
}

export function isEnquirySource(value: string): value is EnquirySource {
  return (ENQUIRY_SOURCES as readonly string[]).includes(value)
}

export function isCaseService(value: string): value is CaseService {
  return CASE_SERVICES.some((service) => service.value === value)
}

export function isContactSubject(value: string): value is ContactSubject {
  return CONTACT_SUBJECTS.some((subject) => subject.value === value)
}

export function caseServiceLabel(value: string) {
  return CASE_SERVICES.find((service) => service.value === value)?.label ?? value
}

export function parseServiceParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return ""
  const match = CASE_SERVICES.find((service) => service.value === raw || service.query === raw)
  return match?.value ?? ""
}

export function showsBusinessProfileUrl(service: string) {
  return service === "profile-recovery" || service === "profile-access" || service === "general"
}

export function showsReviewUrl(service: string) {
  return service === "review-protection" || service === "general"
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asAccepted(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1"
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
  } catch {
    return false
  }
}

function firstError(errors: EnquiryFieldErrors, fallback: string) {
  return Object.values(errors)[0] ?? fallback
}

export function validateEnquiry(raw: unknown): EnquiryValidation {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: PROCESS_ERROR }
  }

  const input = raw as Record<string, unknown>

  for (const key of STRING_FIELDS) {
    if (key in input && input[key] != null && typeof input[key] !== "string") {
      return { valid: false, error: PROCESS_ERROR }
    }
  }

  for (const key of BOOLEAN_FIELDS) {
    if (key in input && input[key] != null && typeof input[key] !== "boolean" && typeof input[key] !== "string") {
      return { valid: false, error: PROCESS_ERROR }
    }
  }

  if (normalizeEnquiryText(asString(input.companyFax))) {
    return { valid: false, error: PROCESS_ERROR }
  }

  const source = normalizeEnquiryText(asString(input.source))
  if (!isEnquirySource(source)) {
    return { valid: false, error: PROCESS_ERROR }
  }

  const data: EnquiryInput = {
    fullName: normalizeEnquiryText(asString(input.fullName)),
    email: normalizeEnquiryText(asString(input.email)),
    businessName: normalizeEnquiryText(asString(input.businessName)),
    country: normalizeEnquiryText(asString(input.country)),
    phone: normalizeEnquiryText(asString(input.phone)),
    service: normalizeEnquiryText(asString(input.service)) as CaseService | "",
    subject: normalizeEnquiryText(asString(input.subject)),
    websiteUrl: normalizeEnquiryText(asString(input.websiteUrl)),
    businessProfileUrl: normalizeEnquiryText(asString(input.businessProfileUrl)),
    reviewUrl: normalizeEnquiryText(asString(input.reviewUrl)),
    details: normalizeEnquiryText(asString(input.details)),
    informationAccurate: asAccepted(input.informationAccurate),
    privacyAccepted: asAccepted(input.privacyAccepted),
    source,
  }

  const errors = collectEnquiryErrors(data)
  if (Object.keys(errors).length) {
    return { valid: false, error: firstError(errors, "Please check the highlighted fields."), errors }
  }

  return { valid: true, data }
}

export function collectEnquiryErrors(data: EnquiryInput): EnquiryFieldErrors {
  const errors: EnquiryFieldErrors = {}
  const isCase = data.source === "get-help"
  const isContact = data.source === "contact"

  if (!data.fullName) errors.fullName = "Please enter your name."
  else if (data.fullName.length > enquiryLimits.fullName) errors.fullName = `Please keep your name within ${enquiryLimits.fullName} characters.`

  if (!data.email || !EMAIL_PATTERN.test(data.email) || data.email.length > enquiryLimits.email) {
    errors.email = "Please enter a valid email address."
  }

  if (isCase && !data.businessName) errors.businessName = "Please enter your business name."
  else if (data.businessName.length > enquiryLimits.businessName) {
    errors.businessName = `Please keep the business name within ${enquiryLimits.businessName} characters.`
  }

  if (isCase && !data.country) errors.country = "Please enter the country your business is based in."
  else if (data.country.length > enquiryLimits.country) {
    errors.country = `Please keep the country within ${enquiryLimits.country} characters.`
  }

  if (data.phone) {
    if (data.phone.length > enquiryLimits.phone || !PHONE_PATTERN.test(data.phone)) {
      errors.phone = "Please enter a valid phone number, or leave this field blank."
    }
  }

  if (isContact) {
    const validSubject = isContactSubject(data.subject)
    const validService = isCaseService(data.service)
    if (!validSubject && !validService) {
      errors.subject = "Please choose a subject."
      errors.service = "Please choose an enquiry type."
    } else if (data.subject && !validSubject) {
      errors.subject = "Please choose a subject."
    }
  } else if (!isCaseService(data.service)) {
    errors.service = isCase ? "Please choose what you need help with." : "Please choose an enquiry type."
  }

  if (data.subject.length > enquiryLimits.subject) {
    errors.subject = `Please keep the subject within ${enquiryLimits.subject} characters.`
  }

  if (data.websiteUrl) {
    if (data.websiteUrl.length > enquiryLimits.websiteUrl || !isHttpUrl(data.websiteUrl)) {
      errors.websiteUrl = "Please enter a valid website URL, or leave this field blank."
    }
  }

  if (data.businessProfileUrl) {
    if (data.businessProfileUrl.length > enquiryLimits.businessProfileUrl || !isHttpUrl(data.businessProfileUrl)) {
      errors.businessProfileUrl = "Please enter a valid Business Profile URL, or leave this field blank."
    }
  }

  if (data.reviewUrl) {
    if (data.reviewUrl.length > enquiryLimits.reviewUrl || !isHttpUrl(data.reviewUrl)) {
      errors.reviewUrl = "Please enter a valid review URL, or leave this field blank."
    }
  }

  if (!data.details) {
    errors.details = isCase
      ? "Please tell us what happened."
      : isContact
        ? "Please enter your message."
        : "Please add a little more detail, within 5,000 characters."
  }
  else if (data.details.length > enquiryLimits.details) {
    errors.details = "Please add a little more detail, within 5,000 characters."
  }

  if (isCase && !data.informationAccurate) {
    errors.informationAccurate = "Please confirm that the information is accurate to the best of your knowledge."
  }

  if (isCase && !data.privacyAccepted) {
    errors.privacyAccepted = "Please confirm that you have read the privacy information."
  }

  return errors
}

export function getCaseIntakeStepErrors(step: 1 | 2 | 3 | 4, values: Partial<EnquiryInput>): EnquiryFieldErrors {
  const draft: EnquiryInput = {
    fullName: values.fullName ?? "",
    email: values.email ?? "",
    businessName: values.businessName ?? "",
    country: values.country ?? "",
    phone: values.phone ?? "",
    service: (values.service ?? "") as CaseService | "",
    subject: values.subject ?? "",
    websiteUrl: values.websiteUrl ?? "",
    businessProfileUrl: values.businessProfileUrl ?? "",
    reviewUrl: values.reviewUrl ?? "",
    details: values.details ?? "",
    informationAccurate: values.informationAccurate === true,
    privacyAccepted: values.privacyAccepted === true,
    source: "get-help",
  }

  const all = collectEnquiryErrors(draft)
  const stepThree: EnquiryField[] = ["details"]
  if (showsBusinessProfileUrl(draft.service)) stepThree.push("businessProfileUrl")
  if (showsReviewUrl(draft.service)) stepThree.push("reviewUrl")

  const keysByStep: Record<1 | 2 | 3 | 4, EnquiryField[]> = {
    1: ["service"],
    2: ["fullName", "email", "businessName", "country", "phone", "websiteUrl"],
    3: stepThree,
    4: ["informationAccurate", "privacyAccepted"],
  }

  const errors: EnquiryFieldErrors = {}
  for (const key of keysByStep[step]) {
    if (all[key]) errors[key] = all[key]
  }
  return errors
}

export async function deliverEnquiry(_data: EnquiryInput): Promise<EnquiryResult> {
  if (process.env.ENQUIRY_PROVIDER_URL) {
    return { ok: false, message: "Enquiries are temporarily unavailable. Please try again shortly." }
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      ok: true,
      simulated: true,
      message: "Development enquiry recorded. In production, this will only confirm after delivery.",
    }
  }

  return { ok: false, message: "Enquiries are temporarily unavailable. Please try again shortly." }
}
