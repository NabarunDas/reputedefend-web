import { NextRequest } from "next/server"
import { caseEvidenceAccess } from "@/lib/case/http"

export function POST(request: NextRequest) {
  return caseEvidenceAccess(request)
}
