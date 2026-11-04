import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { commercialSetupHandoverReadEnabled } from "@/lib/portal/onboarding/flag"
import { loadSetupHandover } from "@/lib/portal/onboarding/handover"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { HandoverUnavailable, HandoverView } from "./handover-view"

export const metadata = { title: "Service setup" }

export default async function SetupHandoverPage() {
  if (!portalAvailable()) redirect("/")
  if (!productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal")
  }
  if (!commercialSetupHandoverReadEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal/products")
  }
  const loaded = await loadSetupHandover()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <HandoverUnavailable />
  return <HandoverView subscriptions={loaded.subscriptions} />
}
