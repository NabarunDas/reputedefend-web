import { NextRequest } from "next/server"
import { portalEvidenceUpload } from "@/lib/portal/documents/upload"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalEvidenceUpload(request)
}
