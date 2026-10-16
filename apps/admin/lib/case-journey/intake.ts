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
    if (!same(snapshot.businessName, input.business.name ?? "")) conflicts.push("The submitted business name does not match the current business record.")
    if (!same(snapshot.country, input.location.country ?? "")) conflicts.push("The submitted country does not match the current location.")
    if (!same(snapshot.email, input.customer.email ?? "")) conflicts.push("The submitted email does not match the current customer email.")
    if (blank(snapshot.websiteUrl) !== blank(input.business.website)) conflicts.push("The submitted website does not match the current business website.")
    if (blank(snapshot.businessProfileUrl) !== blank(input.location.profileUrl)) conflicts.push("The submitted profile URL does not match the current location.")
  }
  return {
    message: input.message,
    reviewUrl: input.reviewUrl,
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
