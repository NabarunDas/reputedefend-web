import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCase } from "@/lib/portal/cases/queries"
import { CaseUnavailable, CaseWorkspace } from "./case-workspace"

export const metadata = { title: "Case" }

export default async function CustomerCasePage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadCustomerCase(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <CaseUnavailable />
  return <CaseWorkspace detail={loaded.detail} />
}
