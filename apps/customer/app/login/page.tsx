import { portalAvailable } from "@/lib/portal/config"
import { LoginClient } from "./login-client"

export const metadata = { title: "Sign in" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!portalAvailable()) {
    return <section>
      <h1>Secure action</h1>
      <p>This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link.</p>
    </section>
  }
  const query = searchParams ? await searchParams : {}
  const ended = query.ended
  const sessionEnded = ended === "security" || (Array.isArray(ended) && ended.includes("security"))
  return <LoginClient sessionEnded={sessionEnded} />
}
