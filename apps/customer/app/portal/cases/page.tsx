import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerCases } from "@/lib/portal/cases/queries"
import { parseCasesRequest } from "@/lib/portal/cases/parse"
import { CasesUnavailable, CasesView } from "./cases-view"

export const metadata = { title: "Cases" }

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!portalAvailable()) redirect("/")
  const query = parseCasesRequest(await searchParams)
  if (!query) notFound()
  const loaded = await loadCustomerCases(query)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <CasesUnavailable />
  return <CasesView view={query.view} page={loaded.page} />
}
