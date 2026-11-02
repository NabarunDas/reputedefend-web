import { productsHubEnabled } from "@/lib/portal/products-hub"
import { PortalChrome } from "./portal-chrome"

/**
 * Visual shell for /portal. Later data pages must still check the portal
 * session and their own authorisation. This layout is not that boundary.
 * My Products does not inherit Recovery or Guard navigation.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalChrome hub={productsHubEnabled()}>{children}</PortalChrome>
}
