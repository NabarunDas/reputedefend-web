export type PortalShell = "legacy" | "launcher" | "recovery" | "guard"

/**
 * The product launcher is not a workspace. Hub off keeps the original bar.
 * `/portal` uses the launcher shell while it redirects, so the Recovery tabs
 * do not flash before My Products.
 */
export function selectPortalShell(pathname: string, hub: boolean): PortalShell {
  if (!hub) return "legacy"
  if (pathname === "/portal" || pathname === "/portal/products" || pathname.startsWith("/portal/products/")) return "launcher"
  if (pathname === "/portal/guard" || pathname.startsWith("/portal/guard/")) return "guard"
  return "recovery"
}
