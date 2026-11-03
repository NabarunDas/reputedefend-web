import { NextRequest } from "next/server"
import { portalCommercialPaymentCommand } from "@/lib/portal/onboarding/payment-command"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalCommercialPaymentCommand(request)
}
