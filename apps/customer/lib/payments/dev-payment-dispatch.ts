import "server-only"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEVELOP_CUSTOMER_BRANCH = /^profilerelaunch-customer-git-develop-([a-z0-9-]+)\.vercel\.app$/

export type PaymentHandoverReason =
  | "mail_not_configured"
  | "queue_denied"
  | "queue_unavailable"
  | "dispatch_not_configured"
  | "dispatch_held"
  | "dispatch_conflict"
  | "provider_accepted"
  | "provider_retryable"
  | "provider_dead"
  | "acceptance_unknown"
  | "queued"

export type PaymentClaim = {
  status?: string
  reason?: string
  replay?: boolean
  jobId?: string
  jobType?: string
  idempotencyKey?: string
  payload?: Record<string, unknown>
  leaseToken?: string
}

export type PaymentMailMessage = {
  idempotencyKey: string
  from: string
  to: string
  subject: string
  text: string
  html?: string | null
  replyTo?: string | null
}

export type PaymentMailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; acceptanceUnknown?: boolean; error: string }

export type PaymentMailSender = {
  send(message: PaymentMailMessage): Promise<PaymentMailResult>
}

type Rpc = {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>
}

type LoadedSend = {
  status?: string
  deliveryStatus?: string
  recipient?: string
  subject?: string
  bodyText?: string
  bodyHtml?: string | null
  suppressed?: boolean
  templateKey?: string
  customerOrigin?: string | null
  firstProviderAttemptAt?: string | null
  contentVersion?: number
  lifecycle?: string
  contentLocked?: boolean
  senderAddress?: string | null
  replyToAddress?: string | null
}

type BeginAttempt = {
  status?: string
  providerCallPermitted?: boolean
  firstProviderAttemptAt?: string | null
}

const alreadySent = new Set(["DELIVERED", "PROVIDER_ACCEPTED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE"])
const permanentlyFailed = new Set(["BOUNCED", "COMPLAINED", "SUPPRESSED"])
/** Matches the Admin provider idempotency window. A retryable job is not a second provider call. */
const PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000

function acceptanceWindowExpired(firstAttemptAt: string | null | undefined): boolean {
  if (!firstAttemptAt) return false
  const started = Date.parse(firstAttemptAt)
  if (!Number.isFinite(started)) return true
  return Date.now() - started >= PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS
}

function branchTeam(host: string | undefined): string | null {
  const team = DEVELOP_CUSTOMER_BRANCH.exec(host ?? "")?.[1]
  if (!team || team.startsWith("-") || team.endsWith("-")) return null
  return team
}

function mailbox(value: string | undefined): boolean {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
}

/** Develop customer Preview pinned to the DEV database. This does not open sending. */
export function devCustomerPaymentPreview(): boolean {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  const team = branchTeam(process.env.VERCEL_BRANCH_URL)
  if (!team) return false
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
    && process.env.CUSTOMER_ORIGIN === `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}

/**
 * Immediate DEV send is open only when this customer Preview can call Resend
 * itself. It does not read the mail-dispatch worker gate or the activation row.
 */
export function devCustomerPaymentSendOpen(): boolean {
  if (!devCustomerPaymentPreview()) return false
  if (process.env.COMMUNICATIONS_SEND_ENABLED !== "true") return false
  if (process.env.JOB_PROVIDER_MODE !== "production") return false
  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.length < 8) return false
  if (!mailbox(process.env.COMMUNICATIONS_FROM_EMAIL)) return false
  return true
}

/** Names which are present or absent. Values are never included. */
export function devCustomerPaymentSendGateReport(): Record<string, boolean> {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return {
    preview: process.env.VERCEL_ENV === "preview",
    develop: process.env.VERCEL_GIT_COMMIT_REF === "develop",
    devDatabase: url === DEV_SUPABASE_URL,
    customerBranch: branchTeam(process.env.VERCEL_BRANCH_URL) !== null,
    customerOrigin: devCustomerPaymentPreview(),
    sendEnabled: process.env.COMMUNICATIONS_SEND_ENABLED === "true",
    providerMode: process.env.JOB_PROVIDER_MODE === "production",
    resendKey: !!process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.length >= 8,
    fromAddress: mailbox(process.env.COMMUNICATIONS_FROM_EMAIL),
    open: devCustomerPaymentSendOpen(),
  }
}

function integerVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null
}

async function failJob(rpc: Rpc, claim: PaymentClaim, retryable: boolean, error: string) {
  await rpc.rpc("job_fail_v1", {
    p_job: claim.jobId,
    p_lease: claim.leaseToken,
    p_error: error,
    p_retryable: retryable,
  })
}

async function sendClaimedPayment(input: {
  rpc: Rpc
  claim: PaymentClaim
  sender: PaymentMailSender
}): Promise<"accepted" | "retry" | "dead" | "unknown"> {
  const claim = input.claim
  const stop = async (outcome: "dead" | "unknown", retryable: boolean, error: string) => {
    await failJob(input.rpc, claim, retryable, error)
    return outcome
  }
  const communicationId = typeof claim.payload?.communicationId === "string" ? claim.payload.communicationId : ""
  const contentVersion = integerVersion(claim.payload?.contentVersion)
  if (!communicationId || contentVersion === null || !claim.idempotencyKey) {
    return stop("dead", false, "Communication is not sendable")
  }
  const loaded = await input.rpc.rpc<LoadedSend>("communication_load_send_v1", {
    p_communication: communicationId,
    p_content_version: contentVersion,
  })
  if (loaded?.status !== "success" || loaded.lifecycle !== "QUEUED" || loaded.contentLocked !== true) {
    return stop("dead", false, "Communication is not sendable")
  }
  if (!loaded.recipient || !loaded.subject || !loaded.bodyText || !loaded.senderAddress) {
    return stop("dead", false, "Communication is not sendable")
  }
  if (loaded.templateKey !== "GUIDED_PAYMENT_REQUEST" || loaded.contentVersion !== contentVersion) {
    return stop("dead", false, "Communication is not sendable")
  }
  if (alreadySent.has(loaded.deliveryStatus || "")) {
    await input.rpc.rpc("job_complete_v1", { p_job: claim.jobId, p_lease: claim.leaseToken })
    return "accepted"
  }
  if (loaded.suppressed || permanentlyFailed.has(loaded.deliveryStatus || "")) {
    return stop("dead", false, "Communication is not sendable")
  }
  const body = `${loaded.bodyText}\n${loaded.bodyHtml ?? ""}`
  if (body.includes("#t=") || body.includes("/action/") || !loaded.customerOrigin || !body.includes(`${loaded.customerOrigin}/portal/cases/`)) {
    return stop("dead", false, "Communication is not sendable")
  }
  const begun = await input.rpc.rpc<BeginAttempt>("communication_begin_provider_attempt_v1", {
    p_communication: communicationId,
    p_content_version: contentVersion,
    p_idempotency_key: claim.idempotencyKey,
  })
  if (begun?.status !== "success" || begun.providerCallPermitted !== true) {
    return stop("unknown", false, "Provider acceptance must be reconciled")
  }
  const sent = await input.sender.send({
    idempotencyKey: claim.idempotencyKey,
    from: loaded.senderAddress,
    to: loaded.recipient,
    subject: loaded.subject,
    text: loaded.bodyText,
    html: loaded.bodyHtml,
    replyTo: loaded.replyToAddress,
  })
  if (!sent.ok) {
    if (sent.acceptanceUnknown) {
      await input.rpc.rpc("communication_mark_acceptance_unknown_v1", {
        p_communication: communicationId,
        p_idempotency_key: claim.idempotencyKey,
      })
      const retryable = !acceptanceWindowExpired(begun.firstProviderAttemptAt || loaded.firstProviderAttemptAt)
      await failJob(input.rpc, claim, retryable, "Email provider acceptance is unknown")
      return "unknown"
    }
    if (!sent.retryable) {
      await input.rpc.rpc("communication_mark_provider_rejected_v1", {
        p_communication: communicationId,
        p_error: "Email provider rejected the message",
        p_retryable: false,
        p_idempotency_key: claim.idempotencyKey,
      })
    }
    await failJob(input.rpc, claim, sent.retryable, "Email provider rejected the message")
    return sent.retryable ? "retry" : "dead"
  }
  await input.rpc.rpc("communication_mark_provider_accepted_v1", {
    p_communication: communicationId,
    p_provider: "resend",
    p_provider_message_id: sent.providerMessageId,
    p_idempotency_key: claim.idempotencyKey,
  })
  await input.rpc.rpc("job_complete_v1", { p_job: claim.jobId, p_lease: claim.leaseToken })
  return "accepted"
}

export function createResendPaymentSender(apiKey: string): PaymentMailSender {
  return {
    async send(message) {
      const payload: Record<string, unknown> = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }
      if (message.html) payload.html = message.html
      if (message.replyTo) payload.reply_to = message.replyTo
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500
          return { ok: false, retryable, error: "Email provider rejected the message" }
        }
        const data = await response.json() as { id?: unknown }
        if (typeof data.id !== "string" || data.id.length === 0) {
          return { ok: false, retryable: false, error: "Email provider rejected the message" }
        }
        return { ok: true, providerMessageId: data.id }
      } catch {
        return { ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }
      }
    },
  }
}

function claimReason(claim: PaymentClaim): PaymentHandoverReason {
  if (claim.reason === "not_ready") return "dispatch_held"
  if (claim.reason === "acceptance_unknown") return "acceptance_unknown"
  if (claim.reason === "already_processed") return "queued"
  if (claim.status === "conflict" || claim.reason === "leased" || claim.reason === "locked") return "dispatch_conflict"
  if (claim.reason === "dead_letter") return "provider_dead"
  return "queue_unavailable"
}

/**
 * Claims and sends the payment email queued by this acceptance request.
 * The browser never supplies the communication id. A closed gate leaves the
 * durable outbox row for Admin Step 7.
 */
export async function dispatchAcceptedPaymentEmail(input: {
  rpc: Rpc
  tokenHash: string
  requestId: string
  origin: string
  sender?: PaymentMailSender
}): Promise<PaymentHandoverReason> {
  if (!devCustomerPaymentSendOpen()) return "dispatch_not_configured"
  let claim: PaymentClaim
  try {
    claim = await input.rpc.rpc<PaymentClaim>("customer_action_claim_guided_payment_email_v1", {
      p_token_hash: input.tokenHash,
      p_request: input.requestId,
      p_customer_origin: input.origin,
    })
  } catch {
    return "queue_unavailable"
  }
  if (claim.replay === true || claim.status !== "success" || !claim.leaseToken || claim.jobType !== "SEND_EMAIL") {
    return claimReason(claim)
  }
  const sender = input.sender ?? createResendPaymentSender(process.env.RESEND_API_KEY ?? "")
  try {
    const settled = await sendClaimedPayment({ rpc: input.rpc, claim, sender })
    if (settled === "accepted") return "provider_accepted"
    if (settled === "retry") return "provider_retryable"
    if (settled === "unknown") return "acceptance_unknown"
    return "provider_dead"
  } catch {
    try {
      await failJob(input.rpc, claim, true, "Email provider acceptance is unknown")
    } catch {
      return "queue_unavailable"
    }
    return "provider_retryable"
  }
}

export function handoverForQueue(input: {
  rpcName: "customer_queue_guided_payment_request_v1" | "customer_action_queue_guided_payment_request_v1"
  queued: { status?: string; reason?: string } | null
  preview: boolean
}): PaymentHandoverReason | null {
  if (!input.queued || input.queued.status !== "success") return "queue_denied"
  if (input.rpcName !== "customer_action_queue_guided_payment_request_v1") return null
  if (!input.preview) return null
  return "dispatch_not_configured"
}
