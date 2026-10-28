import { runDevMailDispatchRequest } from "@/lib/jobs/dev-mail-dispatch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = runDevMailDispatchRequest
