/**
 * What the operator sees before recording step 1 or step 2.
 *
 * Current customer, business and location records come from the existing
 * record reads. The original intake snapshot is shown only when the reviewed
 * read is available. A saved URL is displayed as a saved URL.
 */

export type JourneySnapshot = {
  fullName: string
  email: string
  businessName: string
  country: string
  phone: string
  websiteUrl: string
  businessProfileUrl: string
  reviewUrl: string
  details: string
}

export type JourneyIntakeBrief = {
  message: string
  reviewUrl: string | null
  /** Case opened time. The proposed read returns this as openedAt from cases.created_at. */
  openedAt: string | null
  submittedAtLabel: string | null
  customerName: string
  email: string
  phone: string | null
  emailControl: "verified" | "not_recorded" | "records_disagree"
  businessName: string
  website: string | null
  locationName: string | null
  country: string | null
  profileUrl: string | null
  duplicates: { id: string; name: string }[]
  authority: "verified" | "pending" | "revoked" | "not_recorded" | "records_disagree"
  snapshot: JourneySnapshot | null
  conflicts: string[]
}

export type ScreeningFieldDefaults = {
  website: "PRESENT" | "NONE"
  /** Empty when a profile URL is recorded, so the operator must choose. Not an accessible listing. */
  listing: "NOT_SUPPLIED" | ""
  websiteRecorded: boolean
  profileRecorded: boolean
}

/** UK date and time for the original submission. Europe/London, 24-hour clock. */
export function formatUkSubmittedAt(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/London",
  }).format(date)
}

/**
 * Website and Google listing controls start from the business and location
 * records. A saved Google URL is not an accessible or verified listing, so
 * that control stays unselected until the operator chooses.
 */
export function screeningFieldDefaults(input: { website: string | null; profileUrl: string | null }): ScreeningFieldDefaults {
  const websiteRecorded = blank(input.website).length > 0
  const profileRecorded = blank(input.profileUrl).length > 0
  return {
    website: websiteRecorded ? "PRESENT" : "NONE",
    listing: profileRecorded ? "" : "NOT_SUPPLIED",
    websiteRecorded,
    profileRecorded,
  }
}

/**
 * "No website" or "Not supplied" contradicts a value already on the record.
 * The operator can still record that, but only by marking the discrepancy and escalating.
 */
export function screeningContradictsRecord(input: {
  website: string
  listing: string
  recordedWebsite: string | null
  recordedProfileUrl: string | null
  outcome: string
  discrepancy: boolean
}): boolean {
  if (input.outcome === "ESCALATE" && input.discrepancy) return false
  if (input.website === "NONE" && blank(input.recordedWebsite).length > 0) return true
  if (input.listing === "NOT_SUPPLIED" && blank(input.recordedProfileUrl).length > 0) return true
  return false
}

type RecordShape = {
  name?: string | null
  email?: string
  phone?: string | null
  emailVerified?: boolean
  website?: string | null
  country?: string
  profileUrl?: string | null
}

function blank(value: string | null | undefined): string {
  return (value ?? "").trim()
}

function same(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

/** GB, UK, U.K. and United Kingdom name the same country. Other values stay distinct. */
export function journeyCountryKey(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ")
  if (compact === "gb" || compact === "uk" || compact === "united kingdom") return "gb"
  return compact
}

function countriesConflict(submitted: string, recorded: string): boolean {
  const left = blank(submitted)
  if (!left) return false
  return journeyCountryKey(left) !== journeyCountryKey(recorded)
}

function supplied(value: string | null | undefined): string | null {
  const text = blank(value)
  return text.length ? text : null
}

function canonicalUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase()
}

/**
 * A URL the customer left blank is missing information. A URL they supplied
 * conflicts only when the current record is blank or materially different.
 */
function urlConflict(submitted: string, recorded: string | null | undefined): boolean {
  const left = supplied(submitted)
  if (!left) return false
  const right = supplied(recorded)
  if (!right) return true
  return canonicalUrl(left) !== canonicalUrl(right)
}

function textConflict(submitted: string, recorded: string | null | undefined): boolean {
  const left = supplied(submitted)
  if (!left) return false
  return !same(left, recorded ?? "")
}

export function buildJourneyIntake(input: {
  message: string
  reviewUrl: string | null
  customer: RecordShape
  business: RecordShape
  location: RecordShape
  duplicates: { id: string; name: string }[]
  projectedEmailVerified: boolean
  projectedAuthority: boolean
  membershipStatus: string | null
  snapshot: JourneySnapshot | null
  openedAt?: string | null
}): JourneyIntakeBrief {
  const recordEmail = input.customer.emailVerified === true
  const emailControl = recordEmail === input.projectedEmailVerified
    ? (recordEmail ? "verified" : "not_recorded")
    : "records_disagree"
  const membership = input.membershipStatus
  let authority: JourneyIntakeBrief["authority"]
  if (membership === "revoked") authority = input.projectedAuthority ? "records_disagree" : "revoked"
  else if (membership === "verified") authority = input.projectedAuthority ? "verified" : "records_disagree"
  else if (membership === "pending") authority = input.projectedAuthority ? "records_disagree" : "pending"
  else authority = input.projectedAuthority ? "records_disagree" : "not_recorded"

  const conflicts: string[] = []
  const snapshot = input.snapshot
  if (snapshot) {
    if (textConflict(snapshot.businessName, input.business.name)) conflicts.push("The submitted business name does not match the current business record.")
    if (countriesConflict(snapshot.country, input.location.country ?? "")) conflicts.push("The submitted country does not match the current location.")
    if (textConflict(snapshot.email, input.customer.email)) conflicts.push("The submitted email does not match the current customer email.")
    if (urlConflict(snapshot.websiteUrl, input.business.website)) conflicts.push("The submitted website does not match the current business website.")
    if (urlConflict(snapshot.businessProfileUrl, input.location.profileUrl)) conflicts.push("The submitted profile URL does not match the current location.")
  }
  const openedAt = supplied(input.openedAt)
  return {
    message: input.message,
    reviewUrl: input.reviewUrl,
    openedAt,
    submittedAtLabel: openedAt ? formatUkSubmittedAt(openedAt) : null,
    customerName: input.customer.name ?? "",
    email: input.customer.email ?? "",
    phone: input.customer.phone ?? null,
    emailControl,
    businessName: input.business.name ?? "",
    website: input.business.website ?? null,
    locationName: input.location.name ?? null,
    country: input.location.country ?? null,
    profileUrl: input.location.profileUrl ?? null,
    duplicates: input.duplicates,
    authority,
    snapshot,
    conflicts,
  }
}
