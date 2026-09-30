import { handleStripeWebhook } from "@/lib/payments/webhook"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return handleStripeWebhook(request as never)
}
