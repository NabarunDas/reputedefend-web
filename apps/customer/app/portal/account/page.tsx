import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerAccount } from "@/lib/portal/account/queries"
import { AccountUnavailable, AccountView } from "./account-view"

export const metadata = { title: "Account" }

export default async function AccountPage() {
  if (!portalAvailable()) redirect("/")
  const loaded = await loadCustomerAccount()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <AccountUnavailable />
  return <AccountView account={loaded.account} />
}
