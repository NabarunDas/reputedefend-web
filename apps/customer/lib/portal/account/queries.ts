import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { parseAccount, type CustomerAccount } from "./parse"
import { currentAccountRequest } from "./request-scope"

export type AccountLoad =
  | { status: "ready"; account: CustomerAccount }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

/**
 * The account projection derives the customer from the portal session. This
 * function does not accept a customer id, an email, or an auth user id.
 * Inside one request, the header and the dashboard share that read. A missing
 * request scope does not remember the result.
 */
const accountReads = new WeakMap<object, Promise<AccountLoad>>()

async function readCustomerAccount(): Promise<AccountLoad> {
  const token = await portalToken()
  if (!token) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_account_v1", {
      p_token_hash: tokenHash(token),
    })
    if (row == null) return { status: "unauthenticated" }
    const account = parseAccount(row)
    if (!account) return { status: "unavailable" }
    return { status: "ready", account }
  } catch {
    return { status: "unavailable" }
  }
}

export function loadCustomerAccount(): Promise<AccountLoad> {
  const scope = currentAccountRequest()
  if (!scope) return readCustomerAccount()
  const existing = accountReads.get(scope)
  if (existing) return existing
  const pending = readCustomerAccount()
  accountReads.set(scope, pending)
  return pending
}
