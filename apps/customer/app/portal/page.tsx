import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerDashboard } from "@/lib/portal/cases/queries"
import { PortalHome, PortalUnavailable } from "./portal-home"

export const metadata = { title: "Customer portal" }

export default async function PortalPage() {
  if (!portalAvailable()) redirect("/")
  const loaded = await loadCustomerDashboard()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <PortalUnavailable />
  return <PortalHome dashboard={loaded.dashboard} />
}
