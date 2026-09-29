import { handlerFor, registeredJobHandlers } from "./adapters"
import { jobWorkerConfig, type EnvMap } from "./config"
import type { ClaimedJob, JobHandler, JobType, WorkerCounts } from "./model"

export type JobRpc = {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>
}

export type WorkerRunOptions = {
  rpc: JobRpc
  env?: EnvMap
  handlers?: Partial<Record<JobType, JobHandler>>
  crashAfterProvider?: boolean
  promoteLimit?: number
  claimLimit?: number
}

const emptyCounts = (): WorkerCounts => ({ promoted: 0, claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 })

export async function runJobWorker(options: WorkerRunOptions): Promise<{ status: "disabled" | "success" | "error"; counts: WorkerCounts }> {
  const config = jobWorkerConfig(options.env)
  if (!config.enabled) return { status: "disabled", counts: emptyCounts() }
  const counts = emptyCounts()
  const handlers = options.handlers ?? registeredJobHandlers(options.env)
  try {
    await options.rpc.rpc("job_heartbeat_v1", {
      p_worker: config.workerName,
      p_environment: config.environment,
      p_phase: "start",
      p_error: null,
      p_deployment: config.deploymentId,
    })
    const promoted = await options.rpc.rpc<{ status?: string; promoted?: number }>("job_promote_outbox_v1", {
      p_limit: options.promoteLimit ?? 20,
    })
    counts.promoted = promoted.promoted ?? 0
    const claimed = await options.rpc.rpc<{ status?: string; jobs?: ClaimedJob[] }>("job_claim_batch_v1", {
      p_limit: options.claimLimit ?? 10,
      p_worker: config.workerName,
      p_lease_seconds: 120,
      p_deployment: config.deploymentId,
    })
    const jobs = claimed.jobs ?? []
    counts.claimed = jobs.length
    for (const job of jobs) {
      const outcome = await processClaimedJob(options.rpc, job, handlers, options.crashAfterProvider === true)
      if (outcome === "SUCCEEDED") counts.succeeded += 1
      else if (outcome === "RETRY") counts.retried += 1
      else counts.deadLettered += 1
    }
    await options.rpc.rpc("job_heartbeat_v1", {
      p_worker: config.workerName,
      p_environment: config.environment,
      p_phase: "complete",
      p_error: null,
      p_deployment: config.deploymentId,
    })
    await options.rpc.rpc("job_heartbeat_v1", {
      p_worker: config.workerName,
      p_environment: config.environment,
      p_phase: "success",
      p_error: null,
      p_deployment: config.deploymentId,
    })
    return { status: "success", counts }
  } catch (error) {
    if (error instanceof WorkerCrash) throw error
    try {
      await options.rpc.rpc("job_heartbeat_v1", {
        p_worker: config.workerName,
        p_environment: config.environment,
        p_phase: "error",
        p_error: "Worker invocation failed",
        p_deployment: config.deploymentId,
      })
    } catch { /* Heartbeat failures stay fail-closed and are not logged with secrets. */ }
    return { status: "error", counts }
  }
}

export class WorkerCrash extends Error {
  constructor() {
    super("worker crashed after provider call")
    this.name = "WorkerCrash"
  }
}

async function processClaimedJob(
  rpc: JobRpc,
  job: ClaimedJob,
  handlers: Partial<Record<JobType, JobHandler>>,
  crashAfterProvider: boolean,
): Promise<"SUCCEEDED" | "RETRY" | "DEAD_LETTER"> {
  const handler = handlerFor(job.jobType, handlers)
  if (!handler) {
    const failed = await rpc.rpc<{ jobStatus?: string }>("job_fail_v1", {
      p_job: job.jobId, p_lease: job.leaseToken, p_error: "Unknown job type", p_retryable: false,
    })
    return failed.jobStatus === "RETRY" ? "RETRY" : "DEAD_LETTER"
  }
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    const failed = await rpc.rpc<{ jobStatus?: string }>("job_fail_v1", {
      p_job: job.jobId, p_lease: job.leaseToken, p_error: "Invalid job payload", p_retryable: false,
    })
    return failed.jobStatus === "RETRY" ? "RETRY" : "DEAD_LETTER"
  }
  const result = await handler.execute({ idempotencyKey: job.idempotencyKey, payload: job.payload })
  if (crashAfterProvider) throw new WorkerCrash()
  if (result.ok) {
    await rpc.rpc("job_complete_v1", { p_job: job.jobId, p_lease: job.leaseToken })
    return "SUCCEEDED"
  }
  const failed = await rpc.rpc<{ jobStatus?: string }>("job_fail_v1", {
    p_job: job.jobId, p_lease: job.leaseToken, p_error: result.error, p_retryable: result.retryable,
  })
  return failed.jobStatus === "RETRY" ? "RETRY" : "DEAD_LETTER"
}
