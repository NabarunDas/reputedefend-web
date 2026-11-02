"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { PortalIdleGuard } from "./idle-guard"
import { PortalNav } from "./portal-nav"
import { selectPortalShell } from "./portal-shell"
import { SignOutButton } from "./sign-out-button"

/**
 * Route-aware portal chrome. Session checks stay in each page. This only
 * chooses which navigation the customer sees, using the path already known
 * on the server so the Recovery tabs do not appear on My Products.
 */
export function PortalChrome({ hub, children }: { hub: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? ""
  const shell = selectPortalShell(pathname, hub)
  const title = shell === "guard"
    ? "Relaunch Guard"
    : shell === "recovery"
      ? "Recovery & Review Support"
      : shell === "account"
        ? "Account"
        : "My ProfileRelaunch"
  const navMode = shell === "guard" || shell === "recovery" || shell === "account" ? shell : "legacy"

  return (
    <div className={shell === "launcher" ? "portal-shell portal-shell-launcher" : "portal-shell"}>
      {shell === "launcher" ? null : (
        <div className="portal-bar">
          <div className="portal-context">
            <p className="portal-context-title">{title}</p>
            <SignOutButton />
          </div>
          <PortalNav mode={navMode} />
        </div>
      )}
      <PortalIdleGuard />
      <div className="portal-private">{children}</div>
    </div>
  )
}
