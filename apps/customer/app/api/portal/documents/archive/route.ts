import { NextRequest } from "next/server"
import { portalDocumentArchive } from "@/lib/portal/documents/archive"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalDocumentArchive(request)
}
