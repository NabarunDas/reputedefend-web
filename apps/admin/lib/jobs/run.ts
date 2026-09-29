import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend } from "../auth/backend"
import { authConfig } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { cronAuthorized, jobWorkerConfig } from "./config"
import { runJobWorker } from "./worker"

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: privateResponseHeaders })

export async function runScheduledJobs(request: NextRequest) {
  const config = jobWorkerConfig()
  const authorized = cronAuthorized(request.headers.get("authorization"), config.cronSecret)
  if (authorized === "missing_secret") return reply({ status: "disabled", message: "Job worker is not configured." }, 503)
  if (authorized !== "ok") return reply({ status: "unauthorized" }, 401)
  if (!config.enabled || !authConfig()) {
    return reply({ status: "disabled", promoted: 0, claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 })
  }
  try {
    const result = await runJobWorker({ rpc: backend() })
    return reply({
      status: result.status,
      promoted: result.counts.promoted,
      claimed: result.counts.claimed,
      succeeded: result.counts.succeeded,
      retried: result.counts.retried,
      deadLettered: result.counts.deadLettered,
    }, result.status === "error" ? 503 : 200)
  } catch {
    return reply({ status: "error", promoted: 0, claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 }, 503)
  }
}
