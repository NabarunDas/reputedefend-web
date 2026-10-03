import { NextRequest } from "next/server"
import { portalServiceCommand } from "@/lib/portal/service/command"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalServiceCommand(request)
}
