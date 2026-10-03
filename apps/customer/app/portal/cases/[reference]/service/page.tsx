import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCaseService } from "@/lib/portal/service/queries"
import { ServiceUnavailable, ServiceView } from "./service-view"

export const metadata = { title: "Service and permissions" }

export default async function CustomerCaseServicePage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadCustomerCaseService(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <ServiceUnavailable />
  return <ServiceView service={loaded.service} />
}
