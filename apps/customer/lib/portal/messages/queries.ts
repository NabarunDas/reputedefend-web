import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import {
  parseMessageDetail,
  parseMessagePage,
  type CustomerMessageDetail,
  type CustomerMessagePage,
  type MessagesQuery,
} from "./parse"

export type MessagesLoad =
  | { status: "ready"; page: CustomerMessagePage }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

export type MessageLoad =
  | { status: "ready"; thread: CustomerMessageDetail }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

export async function loadCustomerMessages(query: MessagesQuery): Promise<MessagesLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_messages_v1", {
      p_token_hash: tokenHash(token),
      p_before_time: query.before,
      p_before_selector: query.selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const page = parseMessagePage(row)
    if (!page) return { status: "unavailable" }
    return { status: "ready", page }
  } catch {
    return { status: "unavailable" }
  }
}

export async function loadCustomerMessage(selector: string): Promise<MessageLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_message_v1", {
      p_token_hash: tokenHash(token),
      p_selector: selector,
    })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseMessageDetail(row)
    if (!parsed) return { status: "unavailable" }
    if (!parsed.found) return { status: "not_found" }
    return { status: "ready", thread: parsed.thread }
  } catch {
    return { status: "unavailable" }
  }
}
