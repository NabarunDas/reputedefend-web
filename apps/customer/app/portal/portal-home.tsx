import { SignOutButton } from "./sign-out-button"

/** Security-validation page only. UX-10B designs the portal. */
export function PortalHome() {
  return <section>
    <h1>Customer portal</h1>
    <p>Signed in securely.</p>
    <SignOutButton />
  </section>
}
