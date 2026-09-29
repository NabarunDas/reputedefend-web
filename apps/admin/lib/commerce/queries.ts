import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import type { CatalogueList, OrderList, QuoteList, QuoteListItem, ServiceOrder } from "./model"

export async function loadCatalogue(): Promise<CatalogueList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<CatalogueList | null>("admin_catalogue_list_v1", { p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export async function loadQuotes(status?: string | null, q?: string | null): Promise<QuoteList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<QuoteList | null>("admin_quote_list_v1", {
    p_token: tokenHash(token),
    p_status: status && ["DRAFT", "OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "SUPERSEDED", "CANCELLED"].includes(status) ? status : null,
    p_q: q && q.length <= 80 ? q : null,
  })
  if (result === null) redirect("/login")
  return result
}

export async function loadQuote(id: string): Promise<QuoteListItem | null> {
  await requireStaff()
  if (!isUuid(id)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<(QuoteListItem & { status?: string }) | null>("admin_quote_detail_v1", {
    p_token: tokenHash(token), p_quote: id,
  })
  if (result === null) redirect("/login")
  if (result.status === "conflict") return null
  return result
}

export async function loadOrders(): Promise<OrderList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<OrderList | null>("admin_order_list_v1", { p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export async function loadOrder(id: string): Promise<ServiceOrder | null> {
  await requireStaff()
  if (!isUuid(id)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<(ServiceOrder & { status?: string }) | null>("admin_order_detail_v1", {
    p_token: tokenHash(token), p_order: id,
  })
  if (result === null) redirect("/login")
  if (result.status === "conflict") return null
  return result
}
