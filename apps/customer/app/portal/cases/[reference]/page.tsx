import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCase } from "@/lib/portal/cases/queries"
import { presentCaseCommerce } from "@/lib/portal/payments/model"
import { loadCustomerCasePayments } from "@/lib/portal/payments/queries"
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
  const payments = await loadCustomerCasePayments(reference)
  if (payments.status === "unauthenticated") redirect("/login")
  const commerce = payments.status === "ready" ? presentCaseCommerce(payments.payments.case) : null
  return <CaseWorkspace detail={loaded.detail} commerce={commerce} />
}
