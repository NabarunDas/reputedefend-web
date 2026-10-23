/**
 * COMM-QUOTE-01 on a disposable database.
 * The migration is applied only inside this test. It is not applied to DEV
 * or Production, and no provider is contacted.
 */
import { createHash, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { proposedServiceAgreements } from "../../../../lib/commercial/service-agreements"
import { standardScopeExclusions } from "../../../../lib/commercial/scope-templates"
import { publishedCustomerPriceLabels, renderQuotationOffer } from "../../../../lib/email/quotation-offer"
import { applyChain, preparePlatform } from "../recovery/harness"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { settleDevSendEmailClaim, type DevSendClaim } from "./dev-send"
import { sendEmailHandler } from "./handler"
import {
  deriveQuoteAcceptanceActionId,
  deriveQuoteAcceptanceToken,
  prepareQuoteAcceptanceLink,
} from "./link"
import { createIdempotentMailProvider } from "./mail"
import { deliveryLabel } from "./model"

const db = new PGlite()
const admin = "c2760000-0000-4000-8000-0000000000a1"
const customer = "c2760000-0000-4000-8000-0000000000c1"
const customerAuth = "c2760000-0000-4000-8000-0000000000d1"
const business = "c2760000-0000-4000-8000-000000000022"
const location = "c2760000-0000-4000-8000-000000000023"
const adminToken = "d".repeat(64)
const linkSecret = "quotation-link-secret-for-tests-32b"
const origin = "https://customer.example"
const ownerEvidence = "Business owner approved this exact wording in the project conversation on 22 October 2026."
const guided = proposedServiceAgreements.find(item => item.serviceCode === "GUIDED_RELAUNCH")!

type Json = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  quoteVersionId?: string
  publicRef?: string
  reason?: string
  lifecycle?: string
  deliveryStatus?: string
  actionId?: string
}

const key = () => randomUUID()
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
const later = (hours = 72) => new Date(Date.now() + hours * 3600 * 1000).toISOString()

async function rpc<T = Json>(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? 0)
}

const signatures: Record<string, string[]> = {
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
  communication_apply_provider_event_v1: ["p_provider", "p_provider_event_id", "p_event_type", "p_provider_message_id", "p_occurred_at", "p_bounce_class"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const order = signatures[name] ?? Object.keys(args)
      const values = order.map(item => args[item] ?? null)
      return (await db.query<{ value: T }>(`select public.${name}(${values.map((_, index) => `$${index + 1}`).join(",")}) as value`, values)).rows[0].value
    },
  }
}

async function priceId(serviceCode: string) {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code = $1 and status = 'APPROVED' order by effective_from desc limit 1",
    [serviceCode],
  )).rows[0].id
}

async function createCase(caseType: "PROFILE_RECOVERY" | "REVIEW_PROTECTION" = "PROFILE_RECOVERY") {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, created_at,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1, $2, $3, $4, $5, 'Synthetic issue kept inside this database.', '2026-01-01', now(), now(), 'UNDECIDED')`,
    [id, caseType, customer, business, location],
  )
  return id
}

async function offerService(serviceCode: string, options: { caseId?: string | null; validUntil?: string; standard?: boolean } = {}) {
  const template = options.standard ? standardScopeExclusions(serviceCode) : null
  const caseId = options.caseId === undefined
    ? serviceCode === "RELAUNCH_GUARD" ? null : await createCase(serviceCode.endsWith("REVIEW") ? "REVIEW_PROTECTION" : "PROFILE_RECOVERY")
    : options.caseId
  const payload: Record<string, unknown> = {
    customerId: customer,
    businessId: business,
    locationId: location,
    scope: template?.scope ?? "Recover the suspended profile for this location.",
    exclusions: template?.exclusions ?? "Google decisions stay outside this quotation.",
    validUntil: options.validUntil ?? later(),
    applyDiscount: false,
    priceVersionId: await priceId(serviceCode),
    serviceCode,
  }
  if (caseId) payload.caseId = caseId
  const draft = await rpc("admin_quote_command_v1", [adminToken, key(), "create_draft", payload, null])
  expect(draft?.status, JSON.stringify(draft)).toBe("success")
  const taxed = await rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", {
    quoteId: draft!.id, taxBehaviour: "NOT_APPLICABLE",
  }, draft!.version])
  expect(taxed?.status, JSON.stringify(taxed)).toBe("success")
  const offered = await rpc("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft!.id }, taxed!.version])
  expect(offered?.status, JSON.stringify(offered)).toBe("success")
  return { id: draft!.id!, publicRef: draft!.publicRef!, versionId: offered!.quoteVersionId!, version: offered!.version!, caseId }
}

async function detail(quoteId: string) {
  return rpc<Json & {
    publicRef: string
    caseReference: string | null
    currentVersion: {
      serviceName: string
      totalAmountMinor: number
      currency: string
      paymentModel: string
      scope: string
      exclusions: string
      validUntil: string
      status: string
    }
  }>("admin_quote_detail_v1", [adminToken, quoteId])
}

async function queue(quoteId: string, overrides: Record<string, unknown> = {}, request = key()) {
  const row = await detail(quoteId)
  const actionId = deriveQuoteAcceptanceActionId(request)
  const prepared = prepareQuoteAcceptanceLink(actionId, { COMMUNICATIONS_LINK_SECRET: linkSecret })!
  const rendered = row.currentVersion ? renderQuotationOffer({
    publicRef: row.publicRef,
    caseRef: row.caseReference,
    serviceName: row.currentVersion.serviceName,
    amountMinor: row.currentVersion.totalAmountMinor,
    currency: row.currentVersion.currency,
    paymentModel: row.currentVersion.paymentModel,
    scope: row.currentVersion.scope,
    exclusions: row.currentVersion.exclusions,
    validUntil: row.currentVersion.validUntil,
    actionUrl: `${origin}/action/${actionId}`,
  }) : null
  const payload = {
    quoteId,
    actionId,
    secretHash: prepared.tokenHash,
    linkKeyVersion: prepared.version,
    customerOrigin: origin,
    subject: rendered?.subject ?? "Your ProfileRelaunch quotation",
    bodyText: rendered?.text ?? "not a quotation",
    bodyHtml: rendered?.html ?? "<p>not a quotation</p>",
    fromAddress: "ops@example.com",
    replyTo: null,
    sendEnabled: true,
    devLane: false,
    ...overrides,
  }
  const result = await rpc("admin_queue_quote_offer_email_v1", [adminToken, request, payload])
  return { result, rendered, prepared, actionId, request, payload, row }
}

async function containsToken(token: string) {
  const like = `%${token}%`
  return count(`
    select count(*)::int as n from (
      select body_text as blob from public.communications
      union all select coalesce(body_html, '') from public.communications
      union all select coalesce(subject, '') from public.communications
      union all select payload::text from admin_private.job_outbox
      union all select details::text from public.quote_events
      union all select details::text from public.customer_action_events
      union all select details::text from public.admin_audit_events
      union all select response::text from admin_private.communication_command_receipts
      union all select coalesce(fingerprint, '') from admin_private.communication_command_receipts
    ) rows where blob like $1
  `, [like])
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${customerAuth}', 'alex@example.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${admin}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values ('${customer}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'UK', 'High Street');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${customer}', 'email', 'alex@example.com', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${business}', 'verified', now(), '${admin}', 'Companies House match discussed on a live call.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin, "GB"))
}, 180000)

afterAll(async () => { await db.close() })

describe("quotation email queue", () => {
  it("does not email a quotation that is still bound to the omnibus agreement", async () => {
    const offered = await offerService("GUIDED_RELAUNCH")
    const bound = await db.query<{ commercial_agreement_version: string | null }>(
      "select commercial_agreement_version from public.quote_versions where id = $1",
      [offered.versionId],
    )
    expect(bound.rows[0].commercial_agreement_version).not.toBe(guided.version)
    const queued = await queue(offered.id)
    expect(queued.result).toMatchObject({ status: "denied", reason: "agreement_not_operative" })
    expect(await count("select count(*)::int as n from public.communications")).toBe(0)
    expect(await count("select count(*)::int as n from public.customer_actions where quote_version_id = $1", [offered.versionId])).toBe(0)
  })

  it("queues one idempotent email and materialises the bearer only for the provider", async () => {
    expect((await rpc("admin_record_owner_paid_service_agreement_approval_v1", [adminToken, key(), guided.version, ownerEvidence])).status).toBe("confirmed")
    const offered = await offerService("GUIDED_RELAUNCH", { standard: true })
    const first = await queue(offered.id)
    expect(first.rendered?.text).toContain("Amount: £99.00 GBP")
    expect(first.rendered?.text).toContain("Review and accept quotation")
    expect(first.result).toMatchObject({ status: "success", lifecycle: "QUEUED", deliveryStatus: "NONE" })
    expect(first.result).not.toHaveProperty("actionUrl")
    const replay = await queue(offered.id, {}, first.request)
    expect(replay.result).toEqual(first.result)
    expect(await count("select count(*)::int as n from public.customer_actions where quote_version_id = $1", [offered.versionId])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where aggregate_id = $1", [first.result.id])).toBe(1)
    const second = await queue(offered.id)
    expect(second.result).toMatchObject({ status: "denied", reason: "open_action", actionId: first.actionId })
    expect(await count("select count(*)::int as n from public.customer_actions where quote_version_id = $1", [offered.versionId])).toBe(1)

    const stored = await db.query<{
      body_text: string
      body_html: string
      link_key_version: number
      secret_hash: string
      action_link_version: number | null
    }>(`
      select c.body_text, c.body_html, c.link_key_version, a.secret_hash, a.link_key_version as action_link_version
      from public.communications c
      join public.customer_actions a on a.id = c.customer_action_id
      where c.id = $1
    `, [first.result.id])
    const token = deriveQuoteAcceptanceToken(first.actionId, linkSecret)
    expect(stored.rows[0].secret_hash).toBe(sha256(token))
    expect(stored.rows[0].secret_hash).not.toBe(token)
    expect(stored.rows[0].action_link_version).toBeNull()
    expect(stored.rows[0].link_key_version).toBe(1)
    expect(stored.rows[0].body_text).not.toContain("#t=")
    expect(stored.rows[0].body_text).not.toContain(token)
    expect(stored.rows[0].body_html).not.toContain("#t=")
    const job = await db.query<{ payload: Record<string, unknown> }>(
      "select payload from admin_private.job_outbox where aggregate_id = $1",
      [first.result.id],
    )
    expect(Object.keys(job.rows[0].payload).sort()).toEqual(["communicationId", "contentVersion"])
    expect(await containsToken(token)).toBe(0)
    expect(await containsToken(stored.rows[0].secret_hash)).toBe(0)

    const provider = createIdempotentMailProvider()
    const idempotencyKey = `send-email:${first.result.id}:v1`
    const execute = () => sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: linkSecret }, provider).execute({
      idempotencyKey,
      payload: { communicationId: first.result.id, contentVersion: 1 },
      rpc: namedRpc(),
    })
    expect((await execute()).ok).toBe(true)
    expect((await execute()).ok).toBe(true)
    expect(provider.effects).toBe(1)
    expect(provider.payloads[0].text).toContain(`#t=${token}`)
    expect(provider.payloads[0].html).toContain(`#t=${token}`)
    const stillStored = await db.query<{ body_text: string }>("select body_text from public.communications where id = $1", [first.result.id])
    expect(stillStored.rows[0].body_text).not.toContain("#t=")
    await rpc("communication_mark_provider_accepted_v1", [first.result.id, "resend", "msg_quote_1", idempotencyKey])
    expect((await execute()).ok).toBe(true)
    expect(provider.effects).toBe(1)
    const accepted = await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [first.result.id])
    expect(accepted.rows[0].delivery_status).toBe("PROVIDER_ACCEPTED")
    expect(deliveryLabel({ deliveryStatus: "PROVIDER_ACCEPTED", legacyStatus: null })).toBe("Accepted by email provider")
    const deliveredAt = "2026-10-22T15:00:00.000Z"
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_quote_delivered", "email.delivered", "msg_quote_1", deliveredAt])).toMatchObject({ status: "success", applied: true, duplicate: false })
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_quote_delivered", "email.delivered", "msg_quote_1", deliveredAt])).toMatchObject({ duplicate: true })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [first.result.id])).rows[0].delivery_status).toBe("DELIVERED")
  })

  it("sends Managed and Review wording with that service's price only", async () => {
    for (const code of ["GUIDED_REVIEW", "MANAGED_RELAUNCH", "MANAGED_REVIEW"] as const) {
      const proposed = proposedServiceAgreements.find(item => item.serviceCode === code)!
      expect((await rpc("admin_record_owner_paid_service_agreement_approval_v1", [adminToken, key(), proposed.version, ownerEvidence])).status).toBe("confirmed")
      const offered = await offerService(code, { standard: true })
      const queued = await queue(offered.id)
      expect(queued.result.status, JSON.stringify(queued.result)).toBe("success")
      const own = queued.rendered!.text.match(/Amount: (£[0-9]+\.[0-9]{2}) GBP/)?.[1]
      expect(own).toBeTruthy()
      for (const label of publishedCustomerPriceLabels) {
        if (label !== own) expect(queued.rendered!.text).not.toContain(label)
      }
      expect(queued.rendered!.text).toContain(queued.row.currentVersion.serviceName)
      expect(queued.rendered!.text).not.toContain("Standard wording version ")
      expect(queued.rendered!.text).not.toContain("SHA-256")
      expect(queued.rendered!.text).not.toContain("PS-")
    }
  })

  it("refuses an unverified contact, a changed recipient, a short validity and a stale snapshot", async () => {
    const offered = await offerService("GUIDED_RELAUNCH")
    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
    expect((await queue(offered.id)).result).toMatchObject({ status: "denied", reason: "contact_unverified" })
    await db.query(
      "insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values ($1,'email','alex@example.com',$2,'Verified from a live call with the customer.')",
      [customer, admin],
    )
    expect((await queue(offered.id, { recipient: "other@example.com" })).result).toMatchObject({ status: "denied", reason: "recipient_mismatch" })
    await db.query("update public.business_memberships set status = 'pending', verified_at = null, verified_by = null where customer_id = $1", [customer])
    expect((await queue(offered.id)).result).toMatchObject({ status: "denied", reason: "authority_unverified" })
    await db.query(
      "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $2, evidence = 'Companies House match discussed on a live call.' where customer_id = $1",
      [customer, admin],
    )
    const mismatched = await queue(offered.id)
    const broken = await queue(offered.id, { bodyText: mismatched.payload.bodyText.replace("Amount: £99.00 GBP", "Amount: withheld") })
    expect(broken.result).toMatchObject({ status: "denied", reason: "snapshot_mismatch" })
    expect((await queue(offered.id, { secretHash: "g".repeat(64) })).result.status).toBe("invalid")
    const short = await offerService("GUIDED_RELAUNCH", { validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
    expect((await queue(short.id)).result).toMatchObject({ status: "denied", reason: "link_window" })
    const expired = await offerService("GUIDED_RELAUNCH")
    await db.exec("alter table public.quote_versions disable trigger user")
    await db.query("update public.quote_versions set valid_until = now() - interval '1 minute' where id = $1", [expired.versionId])
    await db.exec("alter table public.quote_versions enable trigger user")
    expect((await queue(expired.id)).result).toMatchObject({ status: "denied", reason: "quote_expired" })
  })

  it("queues DEV quotations for each real verified customer address without a test mailbox gate", async () => {
    const first = await offerService("GUIDED_RELAUNCH")
    const devFirst = await queue(first.id, { devLane: true })
    expect(devFirst.result.status, JSON.stringify(devFirst.result)).toBe("success")

    // An attempt to override the recipient must never reach the customer.
    const rejectedOverride = await offerService("GUIDED_RELAUNCH")
    expect((await queue(rejectedOverride.id, { devLane: true, recipient: "attacker@example.com" })).result)
      .toMatchObject({ status: "denied", reason: "recipient_mismatch" })

    // Same DEV database, a second legitimate address: no allowlist or provider gate.
    await db.query("update public.customers set email = 'synthetic.customer@example.net' where id = $1", [customer])
    await db.query(
      "insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values ($1,'email','synthetic.customer@example.net',$2,'Verified the replacement address on a live call.')",
      [customer, admin],
    )
    await db.query(
      "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $2, evidence = 'Rechecked after the synthetic address change.' where customer_id = $1",
      [customer, admin],
    )
    const second = await offerService("GUIDED_RELAUNCH")
    expect((await queue(second.id, { devLane: true })).result.status).toBe("success")
    const sentTo = (await db.query<{recipient: string}>(
      "select recipient from public.communications where template_key = 'QUOTE_OFFER' and customer_action_id in (select id from public.customer_actions where quote_version_id in ($1, $2)) order by created_at",
      [first.versionId, second.versionId],
    )).rows.map(row => row.recipient)
    expect(sentTo).toEqual(expect.arrayContaining(["alex@example.com", "synthetic.customer@example.net"]))

    // Production uses the same verified-customer recipient rule.
    const third = await offerService("GUIDED_RELAUNCH")
    expect((await queue(third.id, { devLane: false })).result.status).toBe("success")

    // Restore the synthetic fixture for later tests.
    await db.query("update public.customers set email = 'alex@example.com' where id = $1", [customer])
    await db.query("delete from public.customer_contact_verifications where customer_id = $1", [customer])
    await db.query(
      "insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values ($1,'email','alex@example.com',$2,'Verified from a live call with the customer.')",
      [customer, admin],
    )
    await db.query(
      "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $2, evidence = 'Companies House match discussed on a live call.' where customer_id = $1",
      [customer, admin],
    )
  })

  it("cancels an unsent queued email when the link is revoked and preserves the queued event", async () => {
    const offered = await offerService("GUIDED_RELAUNCH")
    const queued = await queue(offered.id)
    expect(queued.result.status).toBe("success")
    const revoked = await rpc("admin_quote_command_v1", [adminToken, key(), "revoke_action", {
      quoteId: offered.id, actionId: queued.actionId, reason: "Customer asked for the link to be withdrawn.",
    }, null])
    expect(revoked?.status).toBe("success")
    const row = await db.query<{ lifecycle: string; delivery_status: string }>(
      "select lifecycle, delivery_status from public.communications where id = $1",
      [queued.result.id],
    )
    expect(row.rows[0]).toEqual({ lifecycle: "CANCELLED", delivery_status: "NONE" })
    expect(await count(
      "select count(*)::int as n from admin_private.communication_delivery_events where communication_id = $1 and event_type = 'QUEUED'",
      [queued.result.id],
    )).toBe(1)
    const replacement = await queue(offered.id)
    expect(replacement.result.status).toBe("success")
    expect(replacement.result.id).not.toBe(queued.result.id)
  })

  it("refuses accepted, cancelled and superseded quotations and a quote with no communications parent", async () => {
    const acceptedOffer = await offerService("GUIDED_RELAUNCH")
    const session = sha256(randomUUID())
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash,
        expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8)`,
      [randomUUID(), customer, business, location, acceptedOffer.caseId, acceptedOffer.versionId, sha256(randomUUID()), admin],
    )
    await db.query(
      "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) select $1, id, $2, now() + interval '1 day' from public.customer_actions where quote_version_id = $3 and status = 'OPEN'",
      [session, customerAuth, acceptedOffer.versionId],
    )
    const beforeMail = await count("select count(*)::int as n from public.communications")
    const accepted = await rpc("accept_paid_service_terms_v1", [session, key(), {
      quoteVersionId: acceptedOffer.versionId,
      businessPurpose: { accepted: true },
      terms: { accepted: true, version: guided.version, hash: guided.contentHash },
      feeBasis: null,
    }])
    expect(accepted.status).toBe("success")
    expect(await count("select count(*)::int as n from public.communications")).toBe(beforeMail)
    expect((await queue(acceptedOffer.id)).result).toMatchObject({ status: "denied", reason: "quote_not_offered" })

    const cancelled = await offerService("GUIDED_RELAUNCH")
    expect((await rpc("admin_quote_command_v1", [adminToken, key(), "cancel", { quoteId: cancelled.id }, cancelled.version]))?.status).toBe("success")
    expect((await queue(cancelled.id)).result).toMatchObject({ status: "denied", reason: "quote_not_offered" })
    const superseded = await offerService("GUIDED_RELAUNCH")
    expect((await rpc("admin_quote_command_v1", [adminToken, key(), "supersede", { quoteId: superseded.id }, superseded.version]))?.status).toBe("success")
    expect((await queue(superseded.id)).result).toMatchObject({ status: "denied", reason: "quote_not_offered" })

    expect((await rpc("admin_record_owner_paid_service_agreement_approval_v1", [
      adminToken, key(), proposedServiceAgreements.find(item => item.serviceCode === "RELAUNCH_GUARD")!.version, ownerEvidence,
    ])).status).toBe("confirmed")
    const guard = await offerService("RELAUNCH_GUARD", { caseId: null, standard: true })
    const parent = await db.query<{ case_id: string | null; monitoring_request_id: string | null }>(
      "select case_id, monitoring_request_id from public.quotes where id = $1",
      [guard.id],
    )
    expect(parent.rows[0].case_id).toBeNull()
    expect(parent.rows[0].monitoring_request_id).toBeNull()
    expect((await queue(guard.id)).result).toMatchObject({ status: "denied", reason: "case_required" })
  })

  it("does not special-case a quotation reference and does not email an accepted one", async () => {
    const definition = await db.query<{ def: string }>("select pg_get_functiondef('public.admin_queue_quote_offer_email_v1(text,uuid,jsonb)'::regprocedure) as def")
    expect(definition.rows[0].def).not.toContain("QT-26-TBGP5Q")
    const offered = await offerService("GUIDED_RELAUNCH")
    const before = await count("select count(*)::int as n from public.communications")
    await db.exec("alter table public.quotes disable trigger user")
    await db.exec("alter table public.quote_versions disable trigger user")
    await db.query("update public.quotes set public_ref = 'QT-26-TBGP5Q', status = 'ACCEPTED' where id = $1", [offered.id])
    await db.query("update public.quote_versions set status = 'ACCEPTED' where quote_id = $1", [offered.id])
    await db.exec("alter table public.quote_versions enable trigger user")
    await db.exec("alter table public.quotes enable trigger user")
    const preserved = await queue(offered.id)
    const after = await db.query<{ public_ref: string; status: string }>("select public_ref, status from public.quotes where id = $1", [offered.id])
    expect(preserved.result).toMatchObject({ status: "denied", reason: "quote_not_offered" })
    expect(after.rows[0]).toEqual({ public_ref: "QT-26-TBGP5Q", status: "ACCEPTED" })
    expect(await count("select count(*)::int as n from public.communications")).toBe(before)

    const burned = await offerService("GUIDED_RELAUNCH")
    const request = key()
    const actionId = deriveQuoteAcceptanceActionId(request)
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash,
        expected_email_snapshot, expires_at, created_by, status, revoked_at
      ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8, 'REVOKED', now())`,
      [actionId, customer, business, location, burned.caseId, burned.versionId, sha256(randomUUID()), admin],
    )
    expect((await queue(burned.id, {}, request)).result.status).toBe("conflict")
  })

  it("claims the development send once and records delivered only from the webhook", async () => {
    const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    const offered = await offerService("GUIDED_RELAUNCH")
    const request = key()
    const actionId = deriveQuoteAcceptanceActionId(request)
    const prepared = prepareQuoteAcceptanceLink(actionId, { COMMUNICATIONS_LINK_SECRET: linkSecret })!
    const row = await detail(offered.id)
    const rendered = row.currentVersion ? renderQuotationOffer({
      publicRef: row.publicRef,
      caseRef: row.caseReference,
      serviceName: row.currentVersion.serviceName,
      amountMinor: row.currentVersion.totalAmountMinor,
      currency: row.currentVersion.currency,
      paymentModel: row.currentVersion.paymentModel,
      scope: row.currentVersion.scope,
      exclusions: row.currentVersion.exclusions,
      validUntil: row.currentVersion.validUntil,
      actionUrl: `${portal}/action/${actionId}`,
    }) : null
    expect(rendered).not.toBeNull()
    const queued = await queue(offered.id, {
      devLane: true,
      customerOrigin: portal,
      subject: rendered!.subject,
      bodyText: rendered!.text,
      bodyHtml: rendered!.html,
      actionId,
      secretHash: prepared.tokenHash,
      linkKeyVersion: prepared.version,
    }, request)
    expect(queued.result.status).toBe("success")
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [adminToken])
    const claimRequest = key()
    const claimed = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, claimRequest, queued.result.id, true, portal])
    expect(claimed.status).toBe("success")
    const provider = createIdempotentMailProvider()
    const settled = await settleDevSendEmailClaim({
      rpc: namedRpc(),
      claim: claimed,
      provider,
      env: {
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "develop",
        VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
        SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
        COMMUNICATIONS_LINK_SECRET: linkSecret,
      },
    })
    expect(settled).toBe("succeeded")
    expect(provider.effects).toBe(1)
    expect(provider.payloads[0]?.to).toBe("alex@example.com")
    expect(provider.payloads[0]?.text).toContain("#t=")
    expect(await containsToken(prepared.token)).toBe(0)
    const accepted = await db.query<{ delivery_status: string; provider_message_id: string }>(
      "select delivery_status, provider_message_id from public.communications where id = $1",
      [queued.result.id],
    )
    expect(accepted.rows[0].delivery_status).toBe("PROVIDER_ACCEPTED")
    const deliveredAt = "2026-10-22T16:00:00.000Z"
    expect(await rpc("communication_apply_provider_event_v1", [
      "resend", "evt_quote_dev_delivered", "email.delivered", accepted.rows[0].provider_message_id, deliveredAt,
    ])).toMatchObject({ status: "success", applied: true, duplicate: false })
    expect(await rpc("communication_apply_provider_event_v1", [
      "resend", "evt_quote_dev_delivered", "email.delivered", accepted.rows[0].provider_message_id, deliveredAt,
    ])).toMatchObject({ duplicate: true })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [queued.result.id])).rows[0].delivery_status).toBe("DELIVERED")
    const replay = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, claimRequest, queued.result.id, true, portal])
    expect(replay.replay).toBe(true)
    expect(provider.effects).toBe(1)
  })

  it("records provider rejection without storing the bearer", async () => {
    const offered = await offerService("GUIDED_RELAUNCH")
    const queued = await queue(offered.id)
    expect(queued.result.status).toBe("success")
    const calls: string[] = []
    const rejected = await sendEmailHandler({ COMMUNICATIONS_LINK_SECRET: linkSecret }, {
      async send() { return { ok: false, retryable: false, error: "rejected" } },
    }).execute({
      idempotencyKey: `send-email:${queued.result.id}:v1`,
      payload: { communicationId: queued.result.id, contentVersion: 1 },
      rpc: {
        async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
          calls.push(name)
          const order = signatures[name] ?? Object.keys(args)
          const values = order.map(item => args[item] ?? null)
          return (await db.query<{ value: T }>(`select public.${name}(${values.map((_, index) => `$${index + 1}`).join(",")}) as value`, values)).rows[0].value
        },
      },
    })
    expect(rejected).toMatchObject({ ok: false, retryable: false })
    expect(calls).toContain("communication_mark_provider_rejected_v1")
    expect(await containsToken(queued.prepared.token)).toBe(0)
    const status = await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [queued.result.id])
    expect(status.rows[0].delivery_status).not.toBe("DELIVERED")
    expect(status.rows[0].delivery_status).not.toBe("PROVIDER_ACCEPTED")
  })
})
