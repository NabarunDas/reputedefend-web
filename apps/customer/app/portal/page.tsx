import { redirect } from "next/navigation"
import { loadPortalHeaderName } from "@/lib/portal/account/header"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerDashboard } from "@/lib/portal/cases/queries"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { PortalHome, PortalUnavailable } from "./portal-home"

export const metadata = { title: "Customer portal" }

export default async function PortalPage() {
  if (!portalAvailable()) redirect("/")
  if (productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal/products")
  }
  const loaded = await loadCustomerDashboard()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <PortalUnavailable />
  const accountName = await loadPortalHeaderName()
  return <PortalHome dashboard={loaded.dashboard} accountName={accountName} />
}
