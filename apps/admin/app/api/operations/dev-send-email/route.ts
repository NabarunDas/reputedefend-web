import { NextRequest } from "next/server"
import { devSendEmailCommand } from "@/lib/communications/dev-send"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return devSendEmailCommand(request)
}
