import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { authConfig, sessionCookie } from "@/lib/auth/config"
import { sessionFromToken } from "@/lib/auth/backend"
import { LoginForm } from "./login-form"

export default async function StaffLogin() {
  if (await sessionFromToken((await cookies()).get(sessionCookie)?.value)) redirect("/")
  return <section className="panel" aria-labelledby="login-title">
    <p className="eyebrow">ProfileRelaunch Admin</p>
    <h1 id="login-title">Admin sign in</h1>
    {authConfig() ? <LoginForm /> : <div className="notice" role="status">
      <h2>Sign-in is not available yet</h2>
      <p>The admin account is being set up. Please try again once setup is complete.</p>
    </div>}
    <p className="muted">This workspace is for authorised admin use.</p>
  </section>
}
