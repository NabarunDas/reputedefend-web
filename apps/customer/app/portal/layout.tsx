import { PortalIdleGuard } from "./idle-guard"
import { PortalNav } from "./portal-nav"
import { SignOutButton } from "./sign-out-button"

/**
 * Visual shell for /portal. Later data pages must still check the portal
 * session and their own authorisation. This layout is not that boundary.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <div className="portal-bar">
        <div className="portal-context">
          <p className="portal-context-title">My ProfileRelaunch</p>
          <SignOutButton />
        </div>
        <PortalNav />
      </div>
      <PortalIdleGuard />
      <div className="portal-private">{children}</div>
    </div>
  )
}
