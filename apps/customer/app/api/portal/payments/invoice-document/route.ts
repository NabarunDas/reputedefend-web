import { NextRequest } from "next/server"
import { portalInvoiceDocument } from "@/lib/portal/billing/invoice-document"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalInvoiceDocument(request)
}
