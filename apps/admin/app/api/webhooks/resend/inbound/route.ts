import { NextRequest } from "next/server"
import { handleResendInboundWebhook } from "@/lib/conversations/receive"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleResendInboundWebhook(request)
}
