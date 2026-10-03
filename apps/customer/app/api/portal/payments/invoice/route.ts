import { NextRequest } from "next/server"
import { portalInvoiceOpen } from "@/lib/portal/payments/invoice"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalInvoiceOpen(request)
}
