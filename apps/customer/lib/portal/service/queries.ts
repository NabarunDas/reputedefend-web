import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseCaseService, type CustomerCaseService } from "./parse"

export type ServiceLoad =
  | { status: "ready"; service: CustomerCaseService }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export async function loadCustomerCaseService(reference: string): Promise<ServiceLoad> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  if (!validToken(token)) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_case_service_v1", {
      p_token_hash: tokenHash(token),
      p_reference: reference,
    })
    if (row == null) return { status: "unauthenticated" }
    const service = parseCaseService(row)
    if (service === "not_found") return { status: "not_found" }
    if (!service) return { status: "unavailable" }
    return { status: "ready", service }
  } catch {
    return { status: "unavailable" }
  }
}
