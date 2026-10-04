import { NextRequest } from "next/server"
import { portalGuardCommand } from "@/lib/portal/guard/command"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalGuardCommand(request)
}
