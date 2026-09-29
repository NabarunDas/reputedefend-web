import { NextRequest } from "next/server"
import { handleResendWebhook } from "@/lib/communications/webhook"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleResendWebhook(request)
}
