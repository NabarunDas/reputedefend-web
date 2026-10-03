import { NextRequest } from "next/server"
import { portalDocumentDownload } from "@/lib/portal/documents/download"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalDocumentDownload(request)
}
