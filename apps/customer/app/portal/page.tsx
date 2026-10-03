import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { getPortalSession } from "@/lib/portal/session"
import { PortalHome } from "./portal-home"

export const metadata = { title: "Customer portal" }

export default async function PortalPage() {
  if (!portalAvailable()) redirect("/")
  // The session is a server-side gate. It is not rendered: UX-10A does not
  // show customer identifiers or any case, payment, or Guard data.
  const session = await getPortalSession()
  if (!session) redirect("/login")
  return <PortalHome />
}
