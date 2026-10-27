import { NextRequest } from "next/server"
import { portalGuardDocument } from "@/lib/portal/billing/guard-document"

export const runtime = "nodejs"

export function GET(request: NextRequest) {
  return portalGuardDocument(request)
}
