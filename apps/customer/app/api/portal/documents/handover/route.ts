import { NextRequest } from "next/server"
import { portalGuidedHandover } from "@/lib/portal/documents/handover"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalGuidedHandover(request)
}
