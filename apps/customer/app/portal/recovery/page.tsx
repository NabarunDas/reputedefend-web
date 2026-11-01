import { redirect } from "next/navigation"
import { loadPortalHeaderName } from "@/lib/portal/account/header"
import { loadCustomerDashboard } from "@/lib/portal/cases/queries"
import { portalAvailable } from "@/lib/portal/config"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { PortalHome, PortalUnavailable } from "../portal-home"

export const metadata = { title: "Recovery & Reviews" }

export default async function RecoveryPage() {
  if (!portalAvailable()) redirect("/")
  if (!productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal")
  }
  const loaded = await loadCustomerDashboard()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <PortalUnavailable />
  const accountName = await loadPortalHeaderName()
  return <PortalHome dashboard={loaded.dashboard} accountName={accountName} />
}
