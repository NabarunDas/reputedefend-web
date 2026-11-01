import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadProductHub } from "@/lib/portal/products/load"
import { productsHubEnabled } from "@/lib/portal/products-hub"
import { getPortalSession } from "@/lib/portal/session"
import { ProductsView } from "./products-view"

export const metadata = { title: "My Products" }

export default async function ProductsPage() {
  if (!portalAvailable()) redirect("/")
  if (!productsHubEnabled()) {
    if (!await getPortalSession()) redirect("/login")
    redirect("/portal")
  }
  const loaded = await loadProductHub()
  if (loaded.status === "unauthenticated") redirect("/login")
  return <ProductsView accountName={loaded.accountName} products={loaded.products} />
}
