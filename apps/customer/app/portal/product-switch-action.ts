"use server"

import { loadProductHub } from "@/lib/portal/products/load"
import { productSwitchChoices, type ProductSwitchChoice } from "@/lib/portal/products/switch"
import { productsHubEnabled } from "@/lib/portal/products-hub"

/** Read-only projection for the switcher. It does not grant a workspace. */
export async function loadProductSwitchAction(): Promise<ProductSwitchChoice[] | null> {
  if (!productsHubEnabled()) return null
  const loaded = await loadProductHub()
  if (loaded.status !== "ready") return null
  return productSwitchChoices(loaded.products)
}
