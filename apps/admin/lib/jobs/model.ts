export const JOB_TYPES = ["SYSTEM_HEALTH_PROBE"] as const
export type JobType = (typeof JOB_TYPES)[number]
export const JOB_STATUSES = ["PENDING", "RUNNING", "RETRY", "SUCCEEDED", "DEAD_LETTER"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const PROVIDER_MODES = ["disabled", "mock", "production"] as const
export type ProviderMode = (typeof PROVIDER_MODES)[number]
export const HEARTBEAT_STATUSES = ["HEALTHY", "LATE", "NEVER_RUN"] as const
export type HeartbeatStatus = (typeof HEARTBEAT_STATUSES)[number]

export type ClaimedJob = {
  jobId: string
  jobType: string
  idempotencyKey: string
  payload: Record<string, unknown>
  leaseToken: string
  attemptNumber: number
  attempts: number
  maxAttempts: number
}

export type JobHandlerResult =
  | { ok: true }
  | { ok: false; retryable: boolean; error: string }

export type JobHandlerInput = {
  idempotencyKey: string
  payload: Record<string, unknown>
}

export type JobHandler = {
  jobType: JobType
  execute(input: JobHandlerInput): Promise<JobHandlerResult>
}

export type WorkerCounts = {
  promoted: number
  claimed: number
  succeeded: number
  retried: number
  deadLettered: number
}

export type JobHealth = {
  heartbeat: {
    status: HeartbeatStatus
    workerName: string | null
    environment: string | null
    lastStartedAt: string | null
    lastCompletedAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    deploymentId: string | null
    updatedAt: string | null
  }
  counts: {
    pending: number
    running: number
    retry: number
    succeeded: number
    deadLetter: number
  }
  jobs: Array<{
    id: string
    jobType: string
    status: JobStatus
    scheduledAt: string
    attempts: number
    maxAttempts: number
    lastError: string | null
    deadLetteredAt: string | null
    completedAt: string | null
    replayCount: number
    version: number
    summary: string
  }>
}

export const isJobType = (value: unknown): value is JobType =>
  typeof value === "string" && (JOB_TYPES as readonly string[]).includes(value)

export function jobStatusLabel(status: string): string {
  if (status === "PENDING") return "Pending"
  if (status === "RUNNING") return "Running"
  if (status === "RETRY") return "Retry scheduled"
  if (status === "SUCCEEDED") return "Succeeded"
  if (status === "DEAD_LETTER") return "Dead letter"
  return status
}

export function heartbeatLabel(status: HeartbeatStatus): string {
  if (status === "HEALTHY") return "Healthy"
  if (status === "LATE") return "Late"
  return "Never run"
}
