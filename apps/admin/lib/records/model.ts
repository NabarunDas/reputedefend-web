export const entities = { client: "Clients", business: "Businesses", location: "Locations" } as const
export type Entity = keyof typeof entities
export const isEntity = (value: string): value is Entity => Object.hasOwn(entities, value)
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
export type RecordItem = { id: string; name: string | null; version: number; email?: string; phone?: string | null; website?: string | null; country?: string; profileUrl?: string | null; businessId?: string; businessName?: string; emailVerified?: boolean; phoneVerified?: boolean }
export type Membership = { customerId: string; businessId: string; name: string; version: number; status: "pending" | "verified" | "revoked"; evidence: string; verifiedAt: string | null }
export type Detail = { record: RecordItem; memberships: Membership[]; submittedBusinesses: { id: string; name: string }[]; duplicates: { id: string; name: string }[]; work: { kind: string; reference: string; status: string; submittedAt: string }[] }
export type Preview = { left: Detail; right: Detail; readOnly: true; leftCases: number; rightCases: number; leftMonitoring: number; rightMonitoring: number; leftLocations: number; rightLocations: number }
export const recordPath = (entity: Entity, id: string) => `/records/${entity}/${id}`
export function safeWebUrl(value: string | null | undefined) {
  if (!value) return null
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null }
}
export function searchFilters(params: Record<string, string | string[] | undefined>) {
  const { q = "", after, business } = params
  if (typeof q !== "string" || q.length > 100 || (after !== undefined && !isUuid(after)) || (business !== undefined && !isUuid(business))) return null
  return { q: q.trim(), after: after || null, business: business || null }
}
