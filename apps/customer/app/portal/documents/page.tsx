import { redirect } from "next/navigation"
import { portalAvailable } from "@/lib/portal/config"
import { loadCustomerDocuments } from "@/lib/portal/documents/queries"
import { DocumentsUnavailable, DocumentsView } from "./documents-view"

export const metadata = { title: "Documents" }

export default async function CustomerDocumentsPage() {
  if (!portalAvailable()) redirect("/")
  const loaded = await loadCustomerDocuments()
  if (loaded.status === "unauthenticated") redirect("/login")
  if (loaded.status === "unavailable") return <DocumentsUnavailable />
  return <DocumentsView documents={loaded.documents} />
}
