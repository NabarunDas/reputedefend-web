import { NextRequest } from "next/server"
import { caseEvidenceUpload } from "@/lib/case/upload"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return caseEvidenceUpload(request)
}
