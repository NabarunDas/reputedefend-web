import { isEntity, isUuid, safeWebUrl } from "./model"
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)
const keys = (x: Record<string, unknown>, allowed: string[]) => Object.keys(x).length === allowed.length && Object.keys(x).every(k => allowed.includes(k))
const text = (x: unknown, min: number, max: number): x is string => typeof x === "string" && x.trim().length >= min && x.length <= max
const version = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x < 2147483647
const web = (x: unknown) => typeof x === "string" && x.length <= 2048 && (x === "" || safeWebUrl(x) !== null)
export type Operation = "save" | "verify" | "membership"
export function commandArgs(operation: Operation, body: unknown): Record<string, unknown> | null {
  if (!object(body)) return null
  if (operation === "save") {
    if (!keys(body, ["entity", "id", "version", "data", "reason"]) || typeof body.entity !== "string" || !isEntity(body.entity) || (body.id !== null && !isUuid(body.id)) || !version(body.version) || (body.id === null ? body.version !== 0 : body.version === 0) || !text(body.reason, 10, 1000) || !object(body.data)) return null
    const d = body.data
    if (body.entity === "client" && (!keys(d, ["name", "email", "phone"]) || !text(d.name, 1, 200) || !text(d.email, 3, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || !text(d.phone, 0, 50))) return null
    if (body.entity === "business" && (!keys(d, ["name", "website"]) || !text(d.name, 1, 200) || !web(d.website))) return null
    if (body.entity === "location" && (!keys(d, ["name", "country", "profileUrl", "businessId"]) || !text(d.name, 0, 200) || !text(d.country, 1, 100) || !web(d.profileUrl) || !isUuid(d.businessId))) return null
    return { p_entity: body.entity, p_id: body.id, p_version: body.version, p_data: d, p_reason: body.reason.trim() }
  }
  if (operation === "verify") {
    if (!keys(body, ["customerId", "version", "channel", "evidence"]) || !isUuid(body.customerId) || !version(body.version) || body.version === 0 || !["email", "phone"].includes(body.channel as string) || !text(body.evidence, 10, 1000)) return null
    return { p_customer: body.customerId, p_version: body.version, p_channel: body.channel, p_evidence: body.evidence.trim() }
  }
  if (!keys(body, ["customerId", "businessId", "version", "status", "evidence"]) || !isUuid(body.customerId) || !isUuid(body.businessId) || !version(body.version) || !["pending", "verified", "revoked"].includes(body.status as string) || !text(body.evidence, 10, 1000)) return null
  return { p_customer: body.customerId, p_business: body.businessId, p_version: body.version, p_status: body.status, p_evidence: body.evidence.trim() }
}
