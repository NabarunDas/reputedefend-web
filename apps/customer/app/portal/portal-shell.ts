export type PortalShell = "legacy" | "launcher" | "recovery" | "guard" | "account"

/**
 * The product launcher is not a workspace. Hub off keeps the original bar.
 * `/portal` uses the launcher shell while it redirects, so the Recovery tabs
 * do not flash before My Products. Account is neutral: it is not a Recovery route.
 */
export function selectPortalShell(pathname: string, hub: boolean): PortalShell {
  if (!hub) return "legacy"
  if (pathname === "/portal" || pathname === "/portal/products" || pathname.startsWith("/portal/products/")) return "launcher"
  if (pathname === "/portal/guard" || pathname.startsWith("/portal/guard/")) return "guard"
  if (pathname === "/portal/account" || pathname.startsWith("/portal/account/")) return "account"
  return "recovery"
}

/** Product name and the page the customer is on. Legacy keeps its original title. */
export function workspaceHeading(pathname: string, shell: PortalShell): { product: string | null; destination: string } {
  if (shell === "guard") {
    const destination = pathname === "/portal/guard/document" || pathname.startsWith("/portal/guard/document/")
      ? "Document"
      : pathname === "/portal/guard"
        ? "Dashboard"
        : "Location"
    return { product: "Relaunch Guard", destination }
  }
  if (shell === "recovery") {
    const destination = pathname === "/portal/cases" || pathname.startsWith("/portal/cases/")
      ? "Cases"
      : pathname === "/portal/documents" || pathname.startsWith("/portal/documents/")
        ? "Documents"
        : pathname === "/portal/messages" || pathname.startsWith("/portal/messages/")
          ? "Messages"
          : pathname === "/portal/payments" || pathname.startsWith("/portal/payments/")
            ? "Payments"
            : "Dashboard"
    return { product: "Recovery & Review Support", destination }
  }
  if (shell === "account") return { product: null, destination: "Account" }
  return { product: null, destination: "My ProfileRelaunch" }
}
