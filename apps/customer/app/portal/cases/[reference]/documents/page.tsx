import { notFound, redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { loadCustomerCaseDocuments } from "@/lib/portal/documents/queries"
import { CaseDocuments, CaseDocumentsUnavailable } from "./case-documents"

export const metadata = { title: "Documents and evidence" }

export default async function CustomerCaseDocumentsPage({ params }: { params: Promise<{ reference: string }> }) {
  if (!portalAvailable()) redirect("/")
  const { reference } = await params
  if (!isPublicCaseReference(reference)) notFound()
  const loaded = await loadCustomerCaseDocuments(reference)
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "not_found") notFound()
  if (loaded.status === "unavailable") return <CaseDocumentsUnavailable />
  return <CaseDocuments documents={loaded.documents} />
}
