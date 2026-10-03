import { portalAvailable } from "@/lib/portal/config"
import { LoginClient } from "./login-client"

export const metadata = { title: "Sign in" }

export default function LoginPage() {
  if (!portalAvailable()) {
    return <section>
      <h1>Secure action</h1>
      <p>This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link.</p>
    </section>
  }
  return <LoginClient />
}
