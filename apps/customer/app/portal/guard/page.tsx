import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerGuard } from "@/lib/portal/guard/queries"
import { GuardUnavailable, GuardView } from "./guard-view"

export const metadata = { title: "Relaunch Guard" }

export default async function CustomerGuardPage() {
  if (!portalAvailable()) redirect("/")
  const loaded = await loadCustomerGuard()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <GuardUnavailable />
  return <GuardView locations={loaded.guard.locations} focused={false} />
}
