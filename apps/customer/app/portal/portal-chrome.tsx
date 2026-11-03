"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { PortalIdleGuard } from "./idle-guard"
import { PortalNav } from "./portal-nav"
import { ProductSwitch } from "./product-switch"
import { selectPortalShell, workspaceHeading } from "./portal-shell"
import { SignOutButton } from "./sign-out-button"

/**
 * Route-aware portal chrome. Session checks stay in each page. This only
 * chooses which navigation the customer sees, using the path already known
 * on the server so the Recovery tabs do not appear on My Products.
 */
export function PortalChrome({ hub, children }: { hub: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const shell = selectPortalShell(pathname, hub)
  const heading = workspaceHeading(pathname, shell)
  const navMode = shell === "guard" || shell === "recovery" || shell === "account" ? shell : "legacy"
  const workspace = shell === "recovery" || shell === "guard" || shell === "account"

  return (
    <div className={shell === "launcher" ? "portal-shell portal-shell-launcher" : "portal-shell"}>
      {shell === "launcher" ? null : (
        <div className="portal-bar">
          <div className="portal-context">
            <div className="portal-context-copy">
              {heading.product ? <p className="portal-context-product">{heading.product}</p> : null}
              <p className="portal-context-title">{heading.destination}</p>
            </div>
            <div className="portal-context-actions">
              {workspace ? <ProductSwitch /> : null}
              <SignOutButton />
            </div>
          </div>
          <PortalNav mode={navMode} />
        </div>
      )}
      <PortalIdleGuard />
      <div className="portal-private">{children}</div>
    </div>
  )
}
