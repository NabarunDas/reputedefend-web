import { PortalNav } from "./portal-nav"
import { SignOutButton } from "./sign-out-button"

/**
 * Visual shell for /portal. Later data pages must still check the portal
 * session and their own authorisation. This layout is not that boundary.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <div className="portal-context">
        <div className="portal-context-copy">
          <p className="portal-context-title">My ProfileRelaunch</p>
          <p className="portal-context-note">Secure customer area</p>
        </div>
        <SignOutButton />
      </div>
      <PortalNav />
      {children}
    </div>
  )
}
