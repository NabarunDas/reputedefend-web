import { NextRequest } from "next/server"
import { portalPaymentCommand } from "@/lib/portal/payments/command"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalPaymentCommand(request)
}
