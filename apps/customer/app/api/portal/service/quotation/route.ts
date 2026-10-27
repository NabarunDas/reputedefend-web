import { NextRequest } from "next/server"
import { portalQuotationDocument } from "@/lib/portal/billing/quotation-document"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalQuotationDocument(request)
}
