import "server-only"
import { cookies } from "next/headers"
import { ACTION_UNAVAILABLE } from "@/lib/access"
import { actionSessionFromToken, backend, tokenHash, validToken } from "@/lib/backend"
import { sessionCookie } from "@/lib/config"
import type { CustomerCasePack } from "./model"

export async function getCustomerCasePack(): Promise<CustomerCasePack | { unavailable: true; message: string }> {
  const token = (await cookies()).get(sessionCookie)?.value
  if (!validToken(token)) return { unavailable: true, message: ACTION_UNAVAILABLE }
  const session = await actionSessionFromToken(token)
  if (!session || (session.kind !== "CASE_ACCESS" && session.kind !== "COMMUNICATION_ACCESS")) return { unavailable: true, message: ACTION_UNAVAILABLE }
  try {
    const pack = await backend().rpc<CustomerCasePack | null>("customer_case_pack_v1", { p_token_hash: tokenHash(token) })
    if (!pack || (pack.kind !== "CASE_ACCESS" && pack.kind !== "COMMUNICATION_ACCESS")) return { unavailable: true, message: ACTION_UNAVAILABLE }
    return { ...pack, evidenceRequests: pack.evidenceRequests ?? [] }
  } catch {
    return { unavailable: true, message: ACTION_UNAVAILABLE }
  }
}
