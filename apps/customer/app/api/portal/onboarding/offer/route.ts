import { NextRequest } from "next/server"
import { portalCommercialOfferCommand } from "@/lib/portal/onboarding/offer-command"

export const runtime = "nodejs"

export function POST(request: NextRequest) {
  return portalCommercialOfferCommand(request)
}
