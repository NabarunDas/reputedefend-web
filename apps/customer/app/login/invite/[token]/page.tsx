import { validToken } from "@/lib/backend"
import { invitedLoginAvailable, portalAvailable } from "@/lib/portal/config"
import { INVITED_LOGIN_UNAVAILABLE } from "@/lib/portal/email"
import { InvitedLoginClient } from "./invited-login-client"

export const metadata = { title: "Sign in", referrer: "no-referrer" as const }

export default async function InvitedLoginPage({ params }: { params: Promise<{ token: string }> }) {
  if (!portalAvailable() || !invitedLoginAvailable()) {
    return <section>
      <h1>Secure action</h1>
      <p>This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link.</p>
    </section>
  }
  const { token } = await params
  if (!validToken(token)) {
    return <section className="auth-card">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Invitation unavailable</h1>
      <p role="alert">{INVITED_LOGIN_UNAVAILABLE}</p>
    </section>
  }
  return <InvitedLoginClient token={token} />
}
