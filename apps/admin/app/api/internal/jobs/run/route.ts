import { runScheduledJobs } from "@/lib/jobs/run"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = runScheduledJobs
