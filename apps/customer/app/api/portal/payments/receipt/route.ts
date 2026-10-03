import { NextRequest } from "next/server"
import { portalReceiptDownload } from "@/lib/portal/payments/receipt"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalReceiptDownload(request)
}
