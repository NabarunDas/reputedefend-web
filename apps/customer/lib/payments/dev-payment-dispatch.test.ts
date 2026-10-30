import { afterEach, describe, expect, it, vi } from "vitest"
import {
  devCustomerPaymentSendGateReport,
  devCustomerPaymentSendOpen,
  dispatchAcceptedPaymentEmail,
  type PaymentMailSender,
} from "./dev-payment-dispatch"

const origin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"

function openLane() {
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-customer-git-develop-clientcove.vercel.app")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("JOB_PROVIDER_MODE", "production")
  vi.stubEnv("RESEND_API_KEY", "re_test_key")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
}

afterEach(() => vi.unstubAllEnvs())

describe("development payment email dispatch", () => {
  it("stays closed unless the customer develop preview can call Resend itself", () => {
    expect(devCustomerPaymentSendOpen()).toBe(false)
    expect(devCustomerPaymentSendGateReport().open).toBe(false)
    openLane()
    vi.stubEnv("DEV_MAIL_DISPATCH_WORKER_ENABLED", "true")
    expect(devCustomerPaymentSendOpen()).toBe(true)
    vi.stubEnv("RESEND_API_KEY", "")
    expect(devCustomerPaymentSendOpen()).toBe(false)
    expect(devCustomerPaymentSendGateReport()).toMatchObject({ resendKey: false, open: false, sendEnabled: true })
  })

  it("claims the queued request without a caller-supplied communication and sends once", async () => {
    openLane()
    const calls: string[] = []
    const sender: PaymentMailSender = {
      async send() {
        calls.push("provider")
        return { ok: true, providerMessageId: "msg_1" }
      },
    }
    const rpc = {
      async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
        calls.push(name)
        if (name === "customer_action_claim_guided_payment_email_v1") {
          expect(args).toEqual({
            p_token_hash: "hash",
            p_request: "request",
            p_customer_origin: origin,
          })
          expect(args).not.toHaveProperty("p_communication")
          return {
            status: "success",
            jobType: "SEND_EMAIL",
            jobId: "job",
            leaseToken: "lease",
            idempotencyKey: "send-email:comm:v1",
            payload: { communicationId: "comm", contentVersion: 1 },
          } as T
        }
        if (name === "communication_load_send_v1") {
          return {
            status: "success",
            lifecycle: "QUEUED",
            contentLocked: true,
            recipient: "alex@example.com",
            subject: "Pay",
            bodyText: `Pay ${origin}/portal/cases/PR-26-ABCDEF/payments`,
            bodyHtml: `<a href="${origin}/portal/cases/PR-26-ABCDEF/payments">Pay</a>`,
            templateKey: "GUIDED_PAYMENT_REQUEST",
            contentVersion: 1,
            senderAddress: "ops@example.com",
            customerOrigin: origin,
            deliveryStatus: "NONE",
          } as T
        }
        if (name === "communication_begin_provider_attempt_v1") return { status: "success", providerCallPermitted: true } as T
        return { status: "success" } as T
      },
    }
    await expect(dispatchAcceptedPaymentEmail({
      rpc,
      tokenHash: "hash",
      requestId: "request",
      origin,
      sender,
    })).resolves.toBe("provider_accepted")
    expect(calls.filter(name => name === "provider")).toHaveLength(1)
    expect(calls).toContain("communication_mark_provider_accepted_v1")
    expect(calls).toContain("job_complete_v1")
  })

  it("does not call the provider again when the claim is already processed", async () => {
    openLane()
    let sent = 0
    const sender: PaymentMailSender = { async send() { sent += 1; return { ok: true, providerMessageId: "msg_1" } } }
    const rpc = {
      async rpc<T>(): Promise<T> {
        return { status: "denied", reason: "already_processed" } as T
      },
    }
    await expect(dispatchAcceptedPaymentEmail({
      rpc,
      tokenHash: "hash",
      requestId: "request",
      origin,
      sender,
    })).resolves.toBe("queued")
    expect(sent).toBe(0)
  })

  it("releases the lease without calling the provider when the payment page cannot be confirmed", async () => {
    openLane()
    let sent = 0
    const failures: Record<string, unknown>[] = []
    const sender: PaymentMailSender = { async send() { sent += 1; return { ok: true, providerMessageId: "msg_1" } } }
    const rpc = {
      async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
        if (name === "customer_action_claim_guided_payment_email_v1") {
          return {
            status: "success",
            jobType: "SEND_EMAIL",
            jobId: "job",
            leaseToken: "lease",
            idempotencyKey: "send-email:comm:v1",
            payload: { communicationId: "comm", contentVersion: 1 },
          } as T
        }
        if (name === "communication_load_send_v1") {
          return {
            status: "success",
            lifecycle: "QUEUED",
            contentLocked: true,
            recipient: "alex@example.com",
            subject: "Pay",
            bodyText: `Open ${origin}/action/secret`,
            bodyHtml: `<a href="${origin}/action/secret">Open</a>`,
            templateKey: "GUIDED_PAYMENT_REQUEST",
            contentVersion: 1,
            senderAddress: "ops@example.com",
            customerOrigin: origin,
            deliveryStatus: "NONE",
          } as T
        }
        if (name === "job_fail_v1") failures.push(args)
        return { status: "success" } as T
      },
    }
    await expect(dispatchAcceptedPaymentEmail({
      rpc, tokenHash: "hash", requestId: "request", origin, sender,
    })).resolves.toBe("provider_dead")
    expect(sent).toBe(0)
    expect(failures).toEqual([{
      p_job: "job",
      p_lease: "lease",
      p_error: "Communication is not sendable",
      p_retryable: false,
    }])
  })

  it("keeps a provider rejection retryable and does not record acceptance", async () => {
    openLane()
    const calls: string[] = []
    const sender: PaymentMailSender = {
      async send() { return { ok: false, retryable: true, error: "busy" } },
    }
    const rpc = {
      async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
        calls.push(name)
        if (name === "job_fail_v1") expect(args.p_retryable).toBe(true)
        if (name === "customer_action_claim_guided_payment_email_v1") {
          return {
            status: "success",
            jobType: "SEND_EMAIL",
            jobId: "job",
            leaseToken: "lease",
            idempotencyKey: "send-email:comm:v1",
            payload: { communicationId: "comm", contentVersion: 1 },
          } as T
        }
        if (name === "communication_load_send_v1") {
          return {
            status: "success",
            lifecycle: "QUEUED",
            contentLocked: true,
            recipient: "alex@example.com",
            subject: "Pay",
            bodyText: `Pay ${origin}/portal/cases/PR-26-ABCDEF/payments`,
            bodyHtml: `<a href="${origin}/portal/cases/PR-26-ABCDEF/payments">Pay</a>`,
            templateKey: "GUIDED_PAYMENT_REQUEST",
            contentVersion: 1,
            senderAddress: "ops@example.com",
            customerOrigin: origin,
            deliveryStatus: "NONE",
          } as T
        }
        if (name === "communication_begin_provider_attempt_v1") {
          return { status: "success", providerCallPermitted: true, firstProviderAttemptAt: new Date().toISOString() } as T
        }
        return { status: "success" } as T
      },
    }
    await expect(dispatchAcceptedPaymentEmail({
      rpc, tokenHash: "hash", requestId: "request", origin, sender,
    })).resolves.toBe("provider_retryable")
    expect(calls).toContain("job_fail_v1")
    expect(calls).not.toContain("communication_mark_provider_accepted_v1")
    expect(calls.filter(name => name === "communication_begin_provider_attempt_v1")).toHaveLength(1)
  })
})
