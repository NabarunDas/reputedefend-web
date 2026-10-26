import { runDevPaymentEventRequest } from "@/lib/jobs/dev-payment-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = runDevPaymentEventRequest
