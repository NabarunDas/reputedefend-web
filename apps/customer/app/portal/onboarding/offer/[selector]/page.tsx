import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { commercialOfferReadEnabled } from "@/lib/portal/onboarding/flag"
import { loadCommercialOffer } from "@/lib/portal/onboarding/offer-load"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { OfferUnavailable, OfferView } from "./offer-view"

export const metadata = { title: "Commercial offer" }

export default async function CommercialOfferPage({ params }: { params: Promise<{ selector: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { selector } = await params
  if (!productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal")
  }
  if (!commercialOfferReadEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal/products")
  }
  const loaded = await loadCommercialOffer(selector)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable" && !loaded.reason) return <OfferUnavailable />
  return <OfferView offer={loaded} />
}
