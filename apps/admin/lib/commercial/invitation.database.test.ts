import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { composeCustomerInvitationEmail } from "../../../../lib/email/customer-invitation"
import { applyChain, preparePlatform } from "../recovery/harness"
import { prepareCustomerInvitationLink } from "../communications/link"
import { settleDevSendEmailClaim } from "../communications/dev-send"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const token = "ab".repeat(32)
const reason = "Checked the enquiry with the caller on 2 November."
const origin = "https://profilerelaunch-customer-git-develop-preview.vercel.app"
const linkEnv = { COMMUNICATIONS_LINK_SECRET: "invitation-link-secret-at-least-32" }
const message = composeCustomerInvitationEmail({ origin })!

type Result = {
  status: string
  reason?: string
  version?: number
  generation?: number
  replay?: boolean
  id?: string
  operation?: string
  originalRequest?: string
  lifecycle?: string
}

async function rpc<T>(name: string, args: unknown[]): Promise<T> {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

const onboarding = (operation: string, payload: object, version = 0, key = randomUUID()) =>
  rpc<Result>("admin_commercial_command_v1", [token, key, operation, payload, version])

async function enquiry(email: string, service = "telloya") {
  const payload = {
    fullName: "North Owner", email, phone: "07123456789", businessName: "North Plumbing",
    country: "United Kingdom", service, subject: "Telloya receptionist",
    details: "Please set up Telloya for this shop.", websiteUrl: "", businessProfileUrl: "", reviewUrl: "", source: "phone",
  }
  const row = await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'phone', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )
  return row.rows[0].id
}

async function ready(email: string) {
  const id = await enquiry(email)
  const opened = await onboarding("classify", { enquiryId: id, product: "TELLOYA", reason })
  const matched = await onboarding("match_customer", { enquiryId: id, create: true, reason }, Number(opened.version))
  const business = await onboarding("match_business", {
    enquiryId: id, create: true, name: `Shop ${email}`, website: "", membership: "pending", reason,
  }, Number(matched.version))
  const located = await onboarding("select_locations", {
    enquiryId: id, create: true, locationName: "High Street", country: "United Kingdom", locationIds: [], reason,
  }, Number(business.version))
  const marked = await onboarding("mark_ready", { enquiryId: id, reason }, Number(located.version))
  const view = await rpc<{ request: { id: string; version: number; businessId: string }; customer: { id: string }; invitationReady: boolean }>(
    "admin_commercial_onboarding_v1", [token, id],
  )
  return { id, version: Number(marked.version), requestId: view.request.id, customerId: view.customer.id, businessId: view.request.businessId, email }
}

function hashes(requestId: string) {
  return [1, 2, 3].map(generation => prepareCustomerInvitationLink(requestId, generation, linkEnv, 1)!.tokenHash)
}

function invite(row: Awaited<ReturnType<typeof ready>>, operation = "issue_invitation", key = randomUUID(), version = row.version) {
  return rpc<Result>("admin_customer_invitation_command_v1", [
    token, key, operation, row.id, version, reason, hashes(row.requestId), origin, "ops@example.com",
    message.subject, message.text, message.html, 1, null,
  ])
}

async function count(table: string, where = "true", params: unknown[] = []) {
  const row = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`, params)
  return row.rows[0].n
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("admin customer invitation dispatch", () => {
  it("queues one invitation for a ready request and ignores a repeated click", async () => {
    const row = await ready("guest@example.com")
    const key = randomUUID()
    const first = await invite(row, "issue_invitation", key)
    expect(first).toMatchObject({ status: "success", generation: 1, lifecycle: "QUEUED", deliveryStatus: "NONE" })
    const again = await invite(row, "issue_invitation", key)
    expect(again).toMatchObject({ status: "success", generation: 1 })
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [row.requestId])).toBe(1)
    expect(await count("public.communications", "invitation_request_id = $1", [row.requestId])).toBe(1)
    expect(await count("admin_private.job_outbox", "topic = 'SEND_EMAIL' and payload->>'communicationId' = $1", [first.id])).toBe(1)
    const stored = (await db.query<{ body_text: string; send_count: number; token_hash: string }>(
      `select c.body_text, i.send_count, i.token_hash
       from public.communications c
       join admin_private.onboarding_invitations i on i.communication_id = c.id
       where c.id = $1`,
      [first.id],
    )).rows[0]
    expect(stored.body_text).toContain("/login/invite/ready")
    expect(stored.body_text).not.toContain(stored.token_hash)
    expect(stored.send_count).toBe(1)
    expect(JSON.stringify(first)).not.toContain(stored.token_hash)
    expect(JSON.stringify(first)).not.toContain(row.email)
    const current = await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])
    const duplicate = await invite(row, "issue_invitation", randomUUID(), current.request.version)
    expect(duplicate).toMatchObject({ status: "conflict", reason: "duplicate" })
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [row.requestId])).toBe(1)
    const view = await rpc<{ status: string; detail: string; canSend: boolean; canResend: boolean; canProcess: boolean; canRevoke: boolean }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(view).toMatchObject({ status: "queued", canSend: false, canResend: false, canProcess: true, canRevoke: true })
    expect(view.detail).toContain("queued is not delivered")
    expect(JSON.stringify(view)).not.toContain(stored.token_hash)
  })

  it("refuses an unready, declined, stale, or already verified request", async () => {
    const early = await enquiry("early@example.com")
    const opened = await onboarding("classify", { enquiryId: early, product: "TELLOYA", reason })
    expect(await invite({
      id: early, version: Number(opened.version), requestId: randomUUID(), customerId: "", businessId: "", email: "",
    })).toMatchObject({ status: "denied" })
    const declined = await ready("declined@example.com")
    expect(await onboarding("decline", { enquiryId: declined.id, reason }, declined.version)).toMatchObject({ status: "success" })
    expect(await invite(declined)).toMatchObject({ status: "denied", reason: "declined" })
    const stale = await ready("stale@example.com")
    expect(await invite(stale, "issue_invitation", randomUUID(), stale.version + 3)).toMatchObject({ status: "conflict", reason: "version" })
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [stale.requestId])).toBe(0)
    const verified = await ready("verified@example.com")
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', $2, $3, 'Verified from a live call with the customer.')`,
      [verified.customerId, verified.email, admin],
    )
    expect(await invite(verified)).toMatchObject({ status: "denied", reason: "already_verified" })
    expect(await count("public.product_entitlements")).toBe(0)
  })

  it("does not let a second customer see the first customer's business", async () => {
    const first = await ready("owner-a@example.com")
    const second = await ready("owner-b@example.com")
    const issued = await invite(first)
    expect(issued.status).toBe("success")
    const linked = (await db.query<{ business_id: string; recipient: string }>(
      `select r.business_id, c.recipient
       from admin_private.onboarding_invitations i
       join public.onboarding_requests r on r.id = i.onboarding_request_id
       join public.communications c on c.id = i.communication_id
       where i.onboarding_request_id = $1`,
      [first.requestId],
    )).rows[0]
    expect(linked.business_id).toBe(first.businessId)
    expect(linked.business_id).not.toBe(second.businessId)
    expect(linked.recipient).toBe(first.email)
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [second.requestId])).toBe(0)
    const products = await rpc<unknown>("customer_portal_products_v1", ["cd".repeat(32)])
    expect(JSON.stringify(products)).not.toContain(second.businessId)
    expect(JSON.stringify(products)).not.toContain(first.businessId)
    expect(await count("public.business_memberships", "customer_id = $1 and business_id = $2 and status = 'pending'", [first.customerId, first.businessId])).toBe(1)
  })

  it("rejects expired, revoked, consumed, and unknown invitation tokens", async () => {
    const row = await ready("cycle@example.com")
    const issued = await invite(row)
    const stored = (await db.query<{ token_hash: string }>(
      "select token_hash from admin_private.onboarding_invitations where onboarding_request_id = $1",
      [row.requestId],
    )).rows[0]
    const auth = randomUUID()
    await db.query("insert into auth.users(id, email, email_confirmed_at) values ($1, $2, now())", [auth, row.email])
    const pending = createHash("sha256").update(randomBytes(32)).digest("hex")
    expect(await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [stored.token_hash, pending])).toMatchObject({ status: "ok", email: row.email })
    expect(await count("public.customer_contact_verifications", "customer_id = $1", [row.customerId])).toBe(0)
    expect(await rpc("customer_portal_confirm_invited_otp_sent_v1", [pending, stored.token_hash])).toEqual({ status: "ok" })
    const session = createHash("sha256").update(randomBytes(32)).digest("hex")
    expect(await rpc("customer_portal_finish_invited_otp_v1", [pending, session, auth, row.email, stored.token_hash])).toEqual({ status: "ok" })
    expect(await count("public.product_entitlements")).toBe(0)
    expect(await count("public.business_memberships", "customer_id = $1 and status = 'pending'", [row.customerId])).toBe(1)
    expect(await count("public.customer_contact_verifications", "customer_id = $1 and proof_kind = 'MAILBOX_OTP'", [row.customerId])).toBe(1)
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [stored.token_hash, createHash("sha256").update("again").digest("hex")])).status).toBe("unavailable")

    const expired = await ready("expired@example.com")
    const expiredMail = await invite(expired)
    await expect(db.query(
      "update admin_private.onboarding_invitations set expires_at = now() - interval '1 minute' where communication_id = $1",
      [expiredMail.id],
    )).rejects.toThrow(/invitation identity is fixed|invitation email is not enabled/i)
    const replacement = randomUUID()
    await db.query(
      `insert into public.communications(
         id, customer_id, business_id, invitation_request_id, invitation_generation, channel, communication_type,
         direction, recipient, subject, body_text, status, lifecycle, delivery_status, template_key, template_version,
         content_version, record_version, content_locked, link_key_version, sender_address
       ) values (
         $1, $2, $3, $4, 2, 'EMAIL', 'CUSTOMER_PORTAL_INVITATION', 'OUTBOUND', $5, $6, 'placeholder',
         'PENDING', 'CANCELLED', 'NONE', 'CUSTOMER_PORTAL_INVITATION', 1, 1, 1, true, 1, 'ops@example.com'
       )`,
      [replacement, expired.customerId, expired.businessId, expired.requestId, expired.email, message.subject],
    )
    const expiredHash = "ee".repeat(32)
    await db.exec(`
      DO $$
      BEGIN
        PERFORM set_config('admin.invitation_maintenance', 'on', true);
        UPDATE admin_private.onboarding_invitations
          SET revoked_at = now()
          WHERE communication_id = '${expiredMail.id}';
        PERFORM set_config('admin.invitation_maintenance', 'off', true);
        PERFORM set_config('admin.invitation_dispatch', 'on', true);
        INSERT INTO admin_private.onboarding_invitations(
          token_hash, onboarding_request_id, email_snapshot, created_at, expires_at, customer_id,
          send_count, generation, link_key_version, communication_id
        ) VALUES (
          '${expiredHash}', '${expired.requestId}', '${expired.email}', now() - interval '8 days', now() - interval '1 day',
          '${expired.customerId}', 1, 2, 1, '${replacement}'
        );
        PERFORM set_config('admin.invitation_dispatch', 'off', true);
      END $$;
    `)
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [expiredHash, createHash("sha256").update("expired").digest("hex")])).status).toBe("unavailable")

    const revoked = await ready("revoked@example.com")
    expect((await invite(revoked)).status).toBe("success")
    const current = await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, revoked.id])
    expect(await rpc<Result>("admin_customer_invitation_command_v1", [
      token, randomUUID(), "revoke_invitation", revoked.id, current.request.version, reason, null, null, null, null, null, null, null, null,
    ])).toMatchObject({ status: "success" })
    const revokedHash = (await db.query<{ token_hash: string }>(
      "select token_hash from admin_private.onboarding_invitations where onboarding_request_id = $1",
      [revoked.requestId],
    )).rows[0].token_hash
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [revokedHash, createHash("sha256").update("revoked").digest("hex")])).status).toBe("unavailable")
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", ["ff".repeat(32), createHash("sha256").update("missing").digest("hex")])).status).toBe("unavailable")
  })

  it("withdraws an invitation when the request is declined and blocks a direct send counter", async () => {
    const row = await ready("withdraw@example.com")
    const issued = await invite(row)
    const current = await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])
    expect(await onboarding("decline", { enquiryId: row.id, reason }, current.request.version)).toMatchObject({ status: "success" })
    const after = (await db.query<{ revoked_at: string | null; lifecycle: string }>(
      `select i.revoked_at, c.lifecycle
       from admin_private.onboarding_invitations i
       join public.communications c on c.id = i.communication_id
       where i.onboarding_request_id = $1`,
      [row.requestId],
    )).rows[0]
    expect(after.revoked_at).toBeTruthy()
    expect(after.lifecycle).toBe("CANCELLED")
    await expect(db.query(
      "update admin_private.onboarding_invitations set send_count = 0 where communication_id = $1",
      [issued.id],
    )).rejects.toThrow(/invitation email is not enabled/i)
    expect(await count("public.service_provisions")).toBe(0)
    expect(await count("public.commercial_subscriptions")).toBe(0)
  })

  it("requires a recent Admin sign-in and hides the command from anonymous callers", async () => {
    const row = await ready("reauth@example.com")
    await db.query("update public.admin_sessions set created_at = now() - interval '31 minutes', last_seen_at = now() where token_hash = $1", [token])
    try {
      expect(await invite(row)).toMatchObject({ status: "reauth_required" })
      expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [row.requestId])).toBe(0)
    } finally {
      await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    }
    await db.exec("set role anon")
    try {
      await expect(invite(row)).rejects.toThrow(/permission denied/i)
    } finally {
      await db.exec("reset role")
    }
  })

  it("accepts the provider payload without describing that acceptance as delivery", async () => {
    const row = await ready("dispatch@example.com")
    const key = randomUUID()
    const issued = await invite(row, "issue_invitation", key)
    const claim = await rpc<{ status: string; jobType: string; payload: { communicationId: string; contentVersion: number }; leaseToken: string; idempotencyKey: string; replay: boolean }>(
      "dev_mail_dispatch_claim_invitation_v1",
      [key, origin],
    )
    expect(claim).toMatchObject({ status: "success", jobType: "SEND_EMAIL", replay: false })
    const sent: string[] = []
    const settled = await settleDevSendEmailClaim({
      rpc: {
        async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
          const names = Object.keys(args)
          const params = names.map((_, index) => `$${index + 1}`).join(",")
          return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, names.map(item => args[item]))).rows[0].value
        },
      },
      claim,
      provider: { async send(input) { sent.push(input.text); return { ok: true, providerMessageId: "msg_test", replay: false } } },
      env: linkEnv,
    })
    expect(settled).toBe("succeeded")
    expect(sent[0]).toMatch(/\/login\/invite\/[a-f0-9]{64}/)
    expect(sent[0]).not.toContain("/login/invite/ready")
    const delivery = (await db.query<{ delivery_status: string; body_text: string }>(
      "select delivery_status, body_text from public.communications where id = $1",
      [issued.id],
    )).rows[0]
    expect(delivery.delivery_status).toBe("PROVIDER_ACCEPTED")
    expect(delivery.body_text).toContain("/login/invite/ready")
    const viewed = await rpc<{ status: string; detail: string; canResend: boolean; canProcess: boolean }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(viewed.status).toBe("accepted")
    expect(viewed.detail).toContain("not delivered")
    expect(viewed.canResend).toBe(false)
    expect(viewed.canProcess).toBe(false)
    const current = await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])
    expect(await invite(row, "resend_invitation", randomUUID(), current.request.version)).toMatchObject({ status: "denied", reason: "already_accepted" })
    expect(await invite(row, "process_invitation", randomUUID(), current.request.version)).toMatchObject({ status: "denied", reason: "already_accepted" })
    expect(await rpc("dev_mail_dispatch_claim_invitation_v1", [key, origin])).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await count("public.communications", "invitation_request_id = $1", [row.requestId])).toBe(1)
  })

  it("recovers one queued invitation after a temporary failure and ignores a second claim", async () => {
    const row = await ready("recover@example.com")
    const key = randomUUID()
    const issued = await invite(row, "issue_invitation", key)
    expect(await invite(row, "resend_invitation", randomUUID(), (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version)).toMatchObject({ status: "denied", reason: "queued" })
    const first = await rpc<{ status: string; jobId: string; leaseToken: string; idempotencyKey: string; jobType: string; payload: Record<string, unknown> }>("dev_mail_dispatch_claim_invitation_v1", [key, origin])
    expect(first.status).toBe("success")
    const processing = await rpc<{ status: string; detail: string; canResend: boolean; canProcess: boolean }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(processing).toMatchObject({ status: "processing", canResend: false, canProcess: false })
    expect(processing.detail).toContain("already being sent")
    const processingVersion = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version
    expect(await invite(row, "process_invitation", randomUUID(), processingVersion)).toMatchObject({ status: "denied", reason: "processing" })
    expect(await invite(row, "resend_invitation", randomUUID(), processingVersion)).toMatchObject({ status: "denied", reason: "processing" })
    const second = await rpc<{ status: string; reason: string }>("dev_mail_dispatch_claim_invitation_v1", [key, origin])
    expect(second).toMatchObject({ status: "conflict", reason: "leased" })
    expect(await count("public.communications", "invitation_request_id = $1", [row.requestId])).toBe(1)
    const retried = await settleDevSendEmailClaim({
      rpc: dbRpc(),
      claim: first,
      env: linkEnv,
    })
    expect(retried).toBe("retry")
    const held = (await db.query<{ delivery_status: string; first_provider_attempt_at: string | null; token_hash: string }>(
      `select c.delivery_status, c.first_provider_attempt_at, i.token_hash
       from public.communications c
       join admin_private.onboarding_invitations i on i.communication_id = c.id
       where c.id = $1`,
      [issued.id],
    )).rows[0]
    expect(held.delivery_status).toBe("NONE")
    expect(held.first_provider_attempt_at).toBeNull()
    const during = await rpc<{ canResend: boolean; canProcess: boolean; status: string }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(during).toMatchObject({ status: "queued", canResend: false, canProcess: true })
    const version = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version
    const processed = await invite(row, "process_invitation", randomUUID(), version)
    expect(processed).toMatchObject({ status: "success", operation: "process_invitation", originalRequest: key })
    expect(processed.id).toBeUndefined()
    const recovered = await rpc<{ status: string; jobType: string; idempotencyKey: string; payload: { communicationId: string }; leaseToken: string }>("dev_mail_dispatch_claim_invitation_v1", [processed.originalRequest, origin])
    expect(recovered).toMatchObject({ status: "success", jobType: "SEND_EMAIL" })
    expect(recovered.payload.communicationId).toBe(issued.id)
    expect(recovered.idempotencyKey).toBe(`send-email:${issued.id}:v1`)
    const sent: string[] = []
    expect(await settleDevSendEmailClaim({
      rpc: dbRpc(),
      claim: recovered,
      provider: { async send(input) { sent.push(input.text); return { ok: true, providerMessageId: "msg_recover", replay: false } } },
      env: linkEnv,
    })).toBe("succeeded")
    expect(sent).toHaveLength(1)
    const after = (await db.query<{ delivery_status: string; token_hash: string; n: number }>(
      `select c.delivery_status, i.token_hash, (select count(*)::int from public.communications where invitation_request_id = $2) as n
       from public.communications c
       join admin_private.onboarding_invitations i on i.communication_id = c.id
       where c.id = $1`,
      [issued.id, row.requestId],
    )).rows[0]
    expect(after.delivery_status).toBe("PROVIDER_ACCEPTED")
    expect(after.token_hash).toBe(held.token_hash)
    expect(after.n).toBe(1)
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [row.requestId])).toBe(1)
  })

  it("does not send again when provider acceptance is unknown", async () => {
    const row = await ready("unknown@example.com")
    const key = randomUUID()
    const issued = await invite(row, "issue_invitation", key)
    const claim = await rpc<{ status: string; idempotencyKey: string; jobId: string; leaseToken: string }>("dev_mail_dispatch_claim_invitation_v1", [key, origin])
    expect(claim.status).toBe("success")
    expect(await rpc("communication_begin_provider_attempt_v1", [issued.id, 1, claim.idempotencyKey])).toMatchObject({ status: "success" })
    expect(await rpc("communication_mark_acceptance_unknown_v1", [issued.id, claim.idempotencyKey])).toMatchObject({ deliveryStatus: "ACCEPTANCE_UNKNOWN" })
    expect(await rpc("job_complete_v1", [claim.jobId, claim.leaseToken])).toMatchObject({ status: "success" })
    const view = await rpc<{ status: string; detail: string; canResend: boolean; canProcess: boolean }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(view.status).toBe("unknown")
    expect(view.detail).toContain("Provider acceptance is unknown")
    expect(view.canResend).toBe(false)
    expect(view.canProcess).toBe(false)
    const version = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version
    expect(await invite(row, "resend_invitation", randomUUID(), version)).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(await invite(row, "process_invitation", randomUUID(), version)).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(await rpc("dev_mail_dispatch_claim_invitation_v1", [key, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(await count("public.communications", "invitation_request_id = $1", [row.requestId])).toBe(1)
  })

  it("replaces a failed invitation, stops at three generations, and cancels a revoked queue", async () => {
    const row = await ready("replace@example.com")
    let current = row.version
    let openId = ""
    for (const generation of [1, 2, 3]) {
      const issued = await invite(row, generation === 1 ? "issue_invitation" : "resend_invitation", randomUUID(), current)
      expect(issued).toMatchObject({ status: "success", generation })
      openId = issued.id!
      expect(await rpc("communication_mark_provider_rejected_v1", [openId, "The provider rejected this invitation.", false, `send-email:${openId}:v1`])).toMatchObject({ deliveryStatus: "FAILED" })
      current = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version
      const view = await rpc<{ canResend: boolean; canProcess: boolean; status: string; detail: string }>("admin_customer_invitation_view_v1", [token, row.id])
      if (generation < 3) {
        expect(view.canResend).toBe(true)
        expect(view.canProcess).toBe(false)
        expect(view.detail).toContain("send a replacement")
      }
    }
    expect(await invite(row, "resend_invitation", randomUUID(), current)).toMatchObject({ status: "denied", reason: "cap" })
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1", [row.requestId])).toBe(3)
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1 and revoked_at is null", [row.requestId])).toBe(1)
    const firstHash = (await db.query<{ token_hash: string }>(
      "select token_hash from admin_private.onboarding_invitations where onboarding_request_id = $1 and generation = 1",
      [row.requestId],
    )).rows[0].token_hash
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [firstHash, createHash("sha256").update("old-link").digest("hex")])).status).toBe("unavailable")

    const queued = await ready("cancel-queue@example.com")
    const queuedKey = randomUUID()
    const queuedMail = await invite(queued, "issue_invitation", queuedKey)
    const queuedVersion = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, queued.id])).request.version
    expect(await rpc<Result>("admin_customer_invitation_command_v1", [
      token, randomUUID(), "revoke_invitation", queued.id, queuedVersion, reason, null, null, null, null, null, null, null, null,
    ])).toMatchObject({ status: "success" })
    expect((await db.query<{ lifecycle: string }>("select lifecycle from public.communications where id = $1", [queuedMail.id])).rows[0].lifecycle).toBe("CANCELLED")
    expect(await rpc("dev_mail_dispatch_claim_invitation_v1", [queuedKey, origin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await count("public.communications", "invitation_request_id = $1", [queued.requestId])).toBe(1)
    const revokedHash = (await db.query<{ token_hash: string }>(
      "select token_hash from admin_private.onboarding_invitations where communication_id = $1",
      [queuedMail.id],
    )).rows[0].token_hash
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [revokedHash, createHash("sha256").update("revoked-queue").digest("hex")])).status).toBe("unavailable")
  })

  it("replaces an expired invitation without leaving the old link usable", async () => {
    const row = await ready("expired-replace@example.com")
    const issued = await invite(row)
    const replacement = randomUUID()
    await db.query(
      `insert into public.communications(
         id, customer_id, business_id, invitation_request_id, invitation_generation, channel, communication_type,
         direction, recipient, subject, body_text, status, lifecycle, delivery_status, template_key, template_version,
         content_version, record_version, content_locked, link_key_version, sender_address
       ) values (
         $1, $2, $3, $4, 2, 'EMAIL', 'CUSTOMER_PORTAL_INVITATION', 'OUTBOUND', $5, $6, 'placeholder',
         'PENDING', 'CANCELLED', 'NONE', 'CUSTOMER_PORTAL_INVITATION', 1, 1, 1, true, 1, 'ops@example.com'
       )`,
      [replacement, row.customerId, row.businessId, row.requestId, row.email, message.subject],
    )
    const expiredHash = "12".repeat(32)
    await db.exec(`
      DO $$
      BEGIN
        PERFORM set_config('admin.invitation_maintenance', 'on', true);
        UPDATE admin_private.onboarding_invitations SET revoked_at = now() WHERE communication_id = '${issued.id}';
        PERFORM set_config('admin.invitation_maintenance', 'off', true);
        PERFORM admin_private.customer_invitation_cancel_queued_v1('${issued.id}'::uuid);
        PERFORM set_config('admin.invitation_dispatch', 'on', true);
        INSERT INTO admin_private.onboarding_invitations(
          token_hash, onboarding_request_id, email_snapshot, created_at, expires_at, customer_id,
          send_count, generation, link_key_version, communication_id
        ) VALUES (
          '${expiredHash}', '${row.requestId}', '${row.email}', now() - interval '8 days', now() - interval '1 day',
          '${row.customerId}', 1, 2, 1, '${replacement}'
        );
        PERFORM set_config('admin.invitation_dispatch', 'off', true);
      END $$;
    `)
    const before = await rpc<{ status: string; canResend: boolean; canProcess: boolean }>("admin_customer_invitation_view_v1", [token, row.id])
    expect(before).toMatchObject({ status: "expired", canResend: true, canProcess: false })
    const version = (await rpc<{ request: { version: number } }>("admin_commercial_onboarding_v1", [token, row.id])).request.version
    const replaced = await invite(row, "resend_invitation", randomUUID(), version)
    expect(replaced).toMatchObject({ status: "success", generation: 3, lifecycle: "QUEUED" })
    expect((await rpc<{ status: string }>("customer_portal_begin_invited_login_v1", [expiredHash, createHash("sha256").update("expired-link").digest("hex")])).status).toBe("unavailable")
    expect(await count("admin_private.onboarding_invitations", "onboarding_request_id = $1 and revoked_at is null", [row.requestId])).toBe(1)
    expect(await count("public.communications", "invitation_request_id = $1 and lifecycle = 'QUEUED'", [row.requestId])).toBe(1)
  })

  it("leaves quotation and case email dispatch unchanged", async () => {
    const defs = (await db.query<{ proname: string; def: string }>(`
      select p.proname, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('dev_mail_dispatch_candidates_v1', 'dev_mail_dispatch_claim_v1', 'dev_mail_dispatch_claim_request_v1')
    `)).rows
    expect(defs.map(item => item.proname).sort()).toEqual([
      "dev_mail_dispatch_candidates_v1",
      "dev_mail_dispatch_claim_request_v1",
      "dev_mail_dispatch_claim_v1",
    ])
    for (const item of defs) expect(item.def).not.toContain("CUSTOMER_PORTAL_INVITATION")
    const shared = defs.find(item => item.proname === "dev_mail_dispatch_claim_v1")
    const sweep = defs.find(item => item.proname === "dev_mail_dispatch_candidates_v1")
    expect(shared?.def).toContain("QUOTE_OFFER")
    expect(shared?.def).toContain("CASE_UPDATE")
    expect(sweep?.def).toContain("QUOTE_OFFER")
    expect(sweep?.def).toContain("CASE_UPDATE")
    const row = await ready("unchanged-mail@example.com")
    const issued = await invite(row)
    expect(await rpc("dev_mail_dispatch_claim_v1", [issued.id, origin])).toMatchObject({ status: "denied", reason: "not_send_email" })
    const listed = await rpc<unknown>("dev_mail_dispatch_candidates_v1", [20, origin])
    expect(JSON.stringify(listed)).not.toContain(issued.id!)
    expect(await count("public.communications", "template_key = 'QUOTE_OFFER'")).toBe(0)
    expect(await count("public.communications", "template_key = 'CASE_UPDATE'")).toBe(0)
    expect(await count("public.communications", "invitation_request_id = $1", [row.requestId])).toBe(1)
  })
})

function dbRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const names = Object.keys(args)
      const params = names.map((_, index) => `$${index + 1}`).join(",")
      return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, names.map(item => args[item]))).rows[0].value
    },
  }
}
