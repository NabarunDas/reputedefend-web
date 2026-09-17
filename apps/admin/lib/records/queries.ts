import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid, type Detail, type Membership, type Entity, type Preview, type RecordItem } from "./model"
async function read<T>(rpc: string, args: Record<string, unknown>): Promise<T> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<T | null>(rpc, { ...args, p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}
export function listRecords(entity: Entity, filters: { q: string; after: string | null; business: string | null }) {
  return read<RecordItem[]>("admin_records_list_v1", { p_entity: entity, p_search: filters.q, p_before: filters.after, p_business: filters.business })
}
export async function recordDetail(entity: Entity, id: string): Promise<Detail> {
  if (!isUuid(id)) notFound()
  const result = await read<Detail | { missing: true }>("admin_record_detail_v1", { p_entity: entity, p_id: id })
  if ("missing" in result) notFound()
  return result
}
export async function duplicatePreview(entity: Entity, left: string, right: string): Promise<Preview> {
  if (entity === "location" || !isUuid(left) || !isUuid(right) || left === right) notFound()
  const result = await read<Preview | { missing: true } | { invalid: true }>("admin_duplicate_preview_v1", { p_entity: entity, p_left: left, p_right: right })
  if ("missing" in result || "invalid" in result) notFound()
  return result
}

export async function getMembership(customer: string, business: string): Promise<Membership | undefined> {
  if (!isUuid(customer) || !isUuid(business)) notFound()
  const result = await read<Membership | { missing: true }>("admin_membership_get_v1", { p_customer: customer, p_business: business })
  return "missing" in result ? undefined : result
}
