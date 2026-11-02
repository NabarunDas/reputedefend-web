import "server-only"
import { loadPortalHeaderName } from "@/lib/portal/account/header"
import { loadCustomerDashboard } from "@/lib/portal/cases/queries"
import { loadCustomerGuard } from "@/lib/portal/guard/queries"
import { productsReadEnabled } from "@/lib/portal/products-read"
import { loadCommercialProducts } from "./queries"
import { presentProducts, type ProductCard } from "./present"

export type ProductHubLoad =
  | { status: "ready"; accountName: string | null; products: ProductCard[] }
  | { status: "unauthenticated" }

/**
 * Session-scoped product summaries. The customer id is not accepted from the
 * browser and is not sent to the dashboard or Guard reads.
 */
export async function loadProductHub(): Promise<ProductHubLoad> {
  const [dashboard, guard, accountName] = await Promise.all([
    loadCustomerDashboard(),
    loadCustomerGuard(),
    loadPortalHeaderName(),
  ])
  if (dashboard.status === "unauthenticated" || guard.status === "unauthenticated") {
    return { status: "unauthenticated" }
  }
  const commercial = productsReadEnabled() ? await loadCommercialProducts() : undefined
  if (commercial === "unauthenticated") return { status: "unauthenticated" }
  return {
    status: "ready",
    accountName,
    products: presentProducts({
      recovery: dashboard.status === "ready"
        ? { status: "ready", dashboard: dashboard.dashboard }
        : { status: "unavailable" },
      guard: guard.status === "ready"
        ? {
          status: "ready",
          locations: guard.guard.locations.map(location => ({
            businessName: location.businessName,
            monitoringActive: location.monitoringActive,
          })),
        }
        : { status: "unavailable" },
      commercial,
    }),
  }
}
