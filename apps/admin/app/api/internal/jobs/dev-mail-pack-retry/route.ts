import { runDevMailPackRetryRequest } from "@/lib/jobs/dev-mail-pack-retry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = runDevMailPackRetryRequest
