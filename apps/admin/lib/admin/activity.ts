export const actions = { CASE_CHANGED: "Case updated", EVIDENCE_CHANGED: "Evidence updated", SIGNED_IN: "Signed in", SIGNED_OUT: "Signed out", SIGNED_OUT_ALL: "Signed out all devices", SESSION_REVOKED: "End another session", RECORD_CREATED: "Record created", RECORD_UPDATED: "Record updated", CONTACT_VERIFIED: "Contact verified", MEMBERSHIP_CHANGED: "Business relationship changed", ENQUIRY_CREATED: "Phone enquiry recorded", ENQUIRY_TRIAGED: "Enquiry triaged", ENQUIRY_CONVERTED: "Enquiry converted" } as const
export const outcomes = { success: "Completed", denied: "Not allowed", conflict: "Record changed or unavailable", reauth_required: "New sign-in needed" } as const
export type Activity = { id: string; createdAt: string; action: keyof typeof actions; outcome: keyof typeof outcomes; targetId: string | null; requestId: string; entity?: string | null; reason?: string | null; details?: Record<string, unknown> }
export type ActivityFilters = { before: string | null; action: string | null; outcome: string | null }
export function parseActivityFilters(params: Record<string, string | string[] | undefined>): ActivityFilters | null {
  const { before, action, outcome } = params
  if ([before, action, outcome].some(Array.isArray)) return null
  if (before && (!/^[1-9]\d{0,18}$/.test(before as string) || BigInt(before as string) > BigInt("9223372036854775807"))) return null
  if (action && !Object.hasOwn(actions, action as string)) return null
  if (outcome && !Object.hasOwn(outcomes, outcome as string)) return null
  return { before: (before as string) || null, action: (action as string) || null, outcome: (outcome as string) || null }
}
export const ukDate = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(value))
