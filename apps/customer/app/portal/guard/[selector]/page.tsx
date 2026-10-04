import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isGuardSelector } from "@/lib/portal/guard/parse"
import { loadCustomerGuardLocation } from "@/lib/portal/guard/queries"
import { GuardUnavailable, GuardView } from "../guard-view"

export const metadata = { title: "Relaunch Guard location" }

export default async function CustomerGuardLocationPage({ params }: { params: Promise<{ selector: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { selector } = await params
  if (!isGuardSelector(selector)) notFound()
  const loaded = await loadCustomerGuardLocation(selector)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <GuardUnavailable />
  return <GuardView locations={[loaded.location]} focused />
}
