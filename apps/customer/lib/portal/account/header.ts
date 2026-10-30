import "server-only"
import { headers } from "next/headers"
import { loadCustomerAccount } from "./queries"

export function isCustomerPortalPath(pathname: string | null): boolean {
  return pathname === "/portal" || !!pathname?.startsWith("/portal/")
}

/**
 * The displayed name comes only from the session account projection.
 * A missing name uses the neutral fallback. Public pages receive null.
 */
export function displayedAccountName(onPortal: boolean, name: string | null | undefined): string | null {
  if (!onPortal) return null
  if (typeof name !== "string") return "My account"
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 200) return "My account"
  return trimmed
}

export async function loadPortalHeaderName(): Promise<string | null> {
  const pathname = (await headers()).get("x-customer-pathname")
  if (!isCustomerPortalPath(pathname)) return null
  const loaded = await loadCustomerAccount()
  const name = loaded.status === "ready" ? loaded.account.name : null
  return displayedAccountName(true, name)
}
