import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { authConfig, sessionCookie } from "@/lib/auth/config"
import { sessionFromToken } from "@/lib/auth/backend"
import { LoginForm } from "./login-form"

export const metadata = { title: "Admin sign in" }

export default async function StaffLogin() {
  if (await sessionFromToken((await cookies()).get(sessionCookie)?.value)) redirect("/")
  return <section className="login-panel" aria-labelledby="login-title">
    <div className="login-brand">
      {/* Static public file so sign-in works without the authenticated image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/profile-relaunch-logo.png" alt="ProfileRelaunch" width={1932} height={446} />
      <span>Admin Portal</span>
    </div>
    <h1 id="login-title">Admin sign in</h1>
    {authConfig() ? <LoginForm /> : <div className="notice" role="status">
      <h2>Sign-in is not available yet</h2>
      <p>The admin account is being set up. Please try again once setup is complete.</p>
    </div>}
    <p className="muted">This workspace is for authorised admin use.</p>
  </section>
}
