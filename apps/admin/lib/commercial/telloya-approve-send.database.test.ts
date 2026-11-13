/**
 * Disposable PGlite coverage for ADMIN-TY-R8 approve-and-send plus the
 * source-only 20261113120000 test-recipient allowlist. Replays the repository
 * chain in-process only. No hosted replay, real Resend send, Stripe, or Retell.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { findMigration, pendingMigrations } from "../recovery/manifest"
import { installTelloyaCatalogueFixture, telloyaPublishedPrices } from "./telloya-catalogue.fixture"

const db = new PGlite()
const admin = "c01c0000-0000-4000-8000-00000000ac08"
const token = "ce".repeat(32)
const reason = "Approve and send the personalised Telloya offer."

async function rpc<T>(name: string, args: unknown[]) {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

beforeAll(async () => {
  expect(pendingMigrations().map(entry => entry.filename)).toEqual([
      "20261113120000_telloya_offer_mail_test_allowlist_v1.sql",
    ])
  expect(findMigration("20261112223000_telloya_approve_send_offer_v1.sql")).toMatchObject({
    appliedToDev: true,
    containsDataChange: true,
    safeToReplay: false,
  })
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${token}', '${admin}', now());
  `)
  await installTelloyaCatalogueFixture(db, admin)
}, 180_000)

afterAll(async () => {
  await db.close()
})

async function readyEnquiry(email: string, planTier = "growth") {
  const payload = {
    fullName: "Alex Owner",
    email,
    phone: "07123456789",
    businessName: "Owner Yard",
    websiteUrl: "",
    country: "United Kingdom",
    service: "telloya",
    subject: "Telloya receptionist",
    details: "Please set up Telloya.",
    source: "telloya",
    planTier,
    locations: "London workshop",
    guardInterested: true,
    guardLocationCount: 2,
  }
  const enquiryId = (await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'telloya', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )).rows[0].id
  const publicRef = `TY-26-${enquiryId.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6).padEnd(6, "2")}`
  await db.query(`update public.enquiries set public_ref = $2 where id = $1`, [enquiryId, publicRef])
  await db.query(
    `insert into admin_private.telloya_admin_demos(enquiry_id, status, completed_at, timezone, note, record_version)
     values ($1, 'COMPLETED', now(), 'Europe/London', 'Finished offline.', 2)`,
    [enquiryId],
  )
  const bootstrap = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
    token, randomUUID(), "bootstrap", { enquiryId },
  ])
  expect(bootstrap.status).toBe("success")
  let current = (await rows<{ record_version: number; customer_id: string; business_id: string }>(
    `select record_version, customer_id, business_id from public.onboarding_requests
     where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
    [enquiryId],
  ))[0]
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1, 'email', $2, $3, $4)`,
    [current.customer_id, email, admin, reason],
  )
  const membershipVersion = (await rows<{ record_version: number }>(
    `select record_version from public.business_memberships where customer_id = $1 and business_id = $2`,
    [current.customer_id, current.business_id],
  ))[0].record_version
  expect((await rpc<Record<string, unknown>>("admin_membership_save_v1", [
    token, current.customer_id, current.business_id, membershipVersion, "verified", reason, randomUUID(),
  ])).status).toBe("success")
  expect((await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
    token, randomUUID(), "create_location", {
      enquiryId,
      locationName: "Owner Yard floor",
      country: "United Kingdom",
    },
  ])).status).toBe("success")
  const guard = (await db.query<{ id: string }>(
    `insert into public.locations(business_id, location_name, country)
     values ($1, 'Guard annex', 'United Kingdom') returning id`,
    [current.business_id],
  )).rows[0].id
  const secondGuard = (await db.query<{ id: string }>(
    `insert into public.locations(business_id, location_name, country)
     values ($1, 'Guard loft', 'United Kingdom') returning id`,
    [current.business_id],
  )).rows[0].id
  current = (await rows<{ record_version: number; customer_id: string; business_id: string }>(
    `select record_version, customer_id, business_id from public.onboarding_requests
     where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
    [enquiryId],
  ))[0]
  return { enquiryId, ...current, guardIds: [guard, secondGuard] }
}

async function approveTemplate() {
  const already = (await rows<{ n: number }>(
    `select count(*)::int as n from admin_private.communication_templates
     where template_key = 'TELLOYA_OFFER' and status = 'APPROVED'
       and body_text_template = admin_private.telloya_offer_composer_contract_body_v1()`,
  ))[0].n
  if (already > 0) return
  const draft = (await rows<{ id: string; record_version: number }>(
    `select id, record_version from admin_private.communication_templates
     where template_key = 'TELLOYA_OFFER' and status = 'DRAFT' order by version desc limit 1`,
  ))[0]
  expect(draft).toBeTruthy()
  await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
  const approved = await rpc<Record<string, unknown>>("admin_settings_command_v1", [
    token, randomUUID(), "approve_template_draft", { id: draft.id }, draft.record_version,
  ])
  expect(approved.status).toBe("success")
}

async function authorizeTestRecipient(email: string, customerId: string) {
  await db.query(
    `insert into admin_private.telloya_offer_mail_test_recipients(email_normalized, customer_id, enabled, note)
     values (admin_private.normalize_email_v1($1), $2, true, 'disposable allowlist')
     on conflict (email_normalized) do update
       set enabled = true, customer_id = excluded.customer_id`,
    [email, customerId],
  )
}

async function installApprovedCustomMinutes(amountMinor: number, minutes: number) {
  const planId = randomUUID()
  const agreementId = randomUUID()
  const conditionId = randomUUID()
  const version = 9300 + Math.floor(Math.random() * 90)
  const ref = `TELLOYA-TEST-CUSTOM-${minutes}`
  await db.query(
    `update public.plan_versions
     set status = 'RETIRED', retired_by = $1, retired_at = now()
     where product_code = 'TELLOYA' and tier_code = 'CUSTOM' and status = 'APPROVED'`,
    [admin],
  )
  await db.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    )
    select $1, 'TELLOYA', $2, 'Telloya test agreement', $3, $4,
      admin_private.commercial_agreement_hash_v1('TELLOYA', $2, 'Telloya test agreement', $3, $4, $5::jsonb),
      $5::jsonb, 'APPROVED', $6, now()`,
    [
      agreementId,
      ref,
      "TEST ONLY. This is not a legal agreement and it is not approved for a customer.",
      "TEST ONLY. This cancellation sentence is not a customer term.",
      JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }]),
      admin,
    ],
  )
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, 'TELLOYA', $2, 'CUSTOM', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', $3, 'NOT_APPLICABLE', $4)`,
    [planId, version, amountMinor, ref],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
     values ($1, 'TELLOYA', 1, 'LOCATION')`,
    [planId],
  )
  await db.query(
    `insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    )
    values (
      $1, $2, 'CUSTOM', 'Custom', $3, false, $4, 999, null,
      admin_private.commercial_plan_conditions_hash_v1('CUSTOM', $3, false, $4, 999, null),
      'APPROVED', $5, now()
    )`,
    [conditionId, planId, minutes, amountMinor, admin],
  )
  await db.query(
    `update public.plan_versions
     set status = 'APPROVED', approved_by = $2, approved_at = now()
     where id = $1`,
    [planId, admin],
  )
  return planId
}

describe("Telloya approve-and-send from saved draft", () => {
  it("does not queue email from draft save or prepare-only, and queues once on approve-send with Custom + Guard", async () => {
    const opened = await readyEnquiry("r8.custom@example.test", "custom")
    await installApprovedCustomMinutes(telloyaPublishedPrices.testCustomQuotationMinor, 400)

    const saved = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "custom",
        customAmountPence: telloyaPublishedPrices.testCustomQuotationMinor,
        customIncludedMinutes: 400,
        customRequirements: "Evening coverage for two sites.",
        proposedGuardQuantity: 2,
        guardLocationIds: opened.guardIds,
        overageOptIn: false,
        overageCapPence: null,
        notes: "Custom £150 with two Guard locations.",
      },
    ])
    expect(saved).toMatchObject({ status: "success", version: 1 })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n).toBe(0)

    const preview = await rpc<Record<string, unknown>>("telloya_offer_preview_v1", [
      token, opened.enquiryId, "",
    ])
    expect(preview).toMatchObject({
      status: "ready",
      previewOnly: true,
      previewMode: "draft_estimate",
      sendable: false,
      queued: false,
      composerVersion: 1,
    })
    expect(String(preview.html)).toContain("Telloya — a ProfileRelaunch company")
    expect(String(preview.html)).toContain("TELLOYA_OFFER_COMPOSER_CONTRACT_V1")
    expect(String(preview.html)).toContain("Illustrative draft")
    expect(String(preview.html)).not.toContain('href="https://')
    expect(String(preview.text)).toContain("Hello Alex Owner")
    expect(String(preview.text)).not.toContain("TELLOYA_OFFER_COMPOSER")
    expect(String(preview.subject)).toContain("[Draft estimate]")
    expect(String(preview.subject)).not.toContain("TELLOYA_OFFER_COMPOSER")
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n).toBe(0)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n).toBe(0)

    const blocked = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 1, reason,
    ])
    expect(blocked.status).toBe("success")
    expect(blocked.amountMinor).toBe(16998)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n).toBe(0)

    const mailDisabled = await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), blocked.subscriptionId, blocked.version, "https://localhost",
    ])
    expect(mailDisabled).toMatchObject({ status: "mail_disabled" })

    await db.query("insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true)")
    const beforeAllow = (await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n
    const beforeAllowOutbox = (await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), blocked.subscriptionId, blocked.version, "https://localhost",
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n).toBe(beforeAllow)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n).toBe(beforeAllowOutbox)

    await authorizeTestRecipient("r8.custom@example.test", opened.customer_id)
    const templateBlocked = await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), blocked.subscriptionId, blocked.version, "https://localhost",
    ])
    expect(templateBlocked).toMatchObject({ status: "template_unapproved" })
    await approveTemplate()

    const key = randomUUID()
    const first = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, key, opened.enquiryId, 1, reason,
    ])
    expect(first).toMatchObject({ status: "success", existing: true, subscriptionId: blocked.subscriptionId })
    const queued = await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), first.subscriptionId, first.version, "https://localhost",
    ])
    expect(queued).toMatchObject({ status: "queued", deliveryStatus: "NONE", composerVersion: 1 })
    const queuedBody = (await rows<{ body_html: string; subject: string; body_text: string }>(
      `select body_html, subject, body_text from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER'`,
      [first.subscriptionId],
    ))[0]
    expect(queuedBody.body_html).toContain("Review your offer")
    expect(queuedBody.body_html).toContain("TELLOYA_OFFER_COMPOSER_CONTRACT_V1")
    expect(queuedBody.body_html).not.toContain("Illustrative draft")
    expect(queuedBody.body_text).toContain("Hello Alex Owner")
    expect(queuedBody.body_text).not.toContain("TELLOYA_OFFER_COMPOSER")
    expect(queued).toMatchObject({ composerContract: "TELLOYA_OFFER_COMPOSER_CONTRACT_V1" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER' and lifecycle is distinct from 'CANCELLED'`,
      [first.subscriptionId],
    ))[0].n).toBe(1)

    const replayPrepare = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, key, opened.enquiryId, 1, reason,
    ])
    expect(replayPrepare).toEqual(first)
    const replayMail = await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), first.subscriptionId, first.version, "https://localhost",
    ])
    expect(replayMail).toMatchObject({ status: "replay", deliveryStatus: "NONE" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER' and lifecycle is distinct from 'CANCELLED'`,
      [first.subscriptionId],
    ))[0].n).toBe(1)

    const adminView = await rpc<Record<string, unknown>>("telloya_offer_admin_v1", [token, opened.enquiryId])
    expect(adminView).toMatchObject({
      status: "ready",
      emailQueued: true,
      emailLifecycle: "QUEUED",
      emailDeliveryStatus: "NONE",
      amountMinor: 16998,
    })

    await db.query("delete from admin_private.telloya_offer_mail_control")
  })

  it("previews a Custom draft estimate without approved catalogue or CUSTOMER_ORIGIN and never queues", async () => {
    const opened = await readyEnquiry("r8.draft.preview@example.test", "custom")
    const beforeMail = (await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n
    const beforeOutbox = (await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n
    const approvedPlanIds = (await rows<{ id: string }>(
      `select id from public.plan_versions
       where product_code = 'TELLOYA' and status = 'APPROVED'`,
    )).map(row => row.id)
    await db.query(
      `update public.plan_versions
       set status = 'RETIRED', retired_by = $1, retired_at = now()
       where id = any($2::uuid[])`,
      [admin, approvedPlanIds],
    )
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.plan_versions
       where product_code = 'TELLOYA' and status = 'APPROVED'`,
    ))[0].n).toBe(0)

    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "custom",
        customAmountPence: 15000,
        customIncludedMinutes: 400,
        customRequirements: "Two sites after hours.",
        proposedGuardQuantity: 2,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Draft estimate with proposed Guard quantity.",
      },
    ])).toMatchObject({ status: "success", version: 1 })

    const preview = await rpc<Record<string, unknown>>("telloya_offer_preview_v1", [
      token, opened.enquiryId, null,
    ])
    expect(preview).toMatchObject({
      status: "ready",
      previewMode: "draft_estimate",
      sendable: false,
      previewOnly: true,
      queued: false,
      composerVersion: 1,
    })
    expect(String(preview.text)).toContain("Illustrative draft — not an approved offer; no email sent")
    expect(String(preview.text)).toContain("£150.00")
    expect(String(preview.text)).toContain("2 locations")
    expect(String(preview.html)).not.toContain("VC-PREVIEW")
    expect(String(preview.html)).not.toContain('href="https://')
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from public.communications where template_key = 'TELLOYA_OFFER'",
    ))[0].n).toBe(beforeMail)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n).toBe(beforeOutbox)
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.onboarding_requests
       where enquiry_id = $1 and commercial_subscription_id is not null`,
      [opened.enquiryId],
    ))[0].n).toBe(0)

    await db.query(
      `update public.plan_versions
       set status = 'APPROVED', retired_by = null, retired_at = null, approved_by = $1, approved_at = coalesce(approved_at, now())
       where id = any($2::uuid[])`,
      [admin, approvedPlanIds],
    )
  })

  it("rejects a Growth catalogue reprice that no longer matches the saved quotation", async () => {
    const opened = await readyEnquiry("r8.standard.mismatch@example.test", "growth")
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        customAmountPence: null,
        customIncludedMinutes: null,
        customRequirements: "",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Saved Growth £79 / 300 minutes.",
      },
    ])).toMatchObject({ status: "success", version: 1 })

    await db.query(
      `update public.plan_versions
       set status = 'RETIRED', retired_by = $1, retired_at = now()
       where product_code = 'TELLOYA' and tier_code = 'GROWTH' and status = 'APPROVED'`,
      [admin],
    )
    const planId = randomUUID()
    const agreementId = randomUUID()
    const conditionId = randomUUID()
    await db.query(
      `insert into public.commercial_agreement_versions(
        id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
        required_confirmations, status, approved_by, approved_at
      )
      select $1, 'TELLOYA', $2, 'Telloya reprice agreement', $3, $4,
        admin_private.commercial_agreement_hash_v1('TELLOYA', $2, 'Telloya reprice agreement', $3, $4, $5::jsonb),
        $5::jsonb, 'APPROVED', $6, now()`,
      [
        agreementId,
        "TELLOYA-TEST-GROWTH-REPRICE",
        "TEST ONLY. This is not a legal agreement and it is not approved for a customer.",
        "TEST ONLY. This cancellation sentence is not a customer term.",
        JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }]),
        admin,
      ],
    )
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      ) values ($1, 'TELLOYA', 9901, 'GROWTH', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', 8900, 'NOT_APPLICABLE', $2)`,
      [planId, "TELLOYA-TEST-GROWTH-REPRICE"],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       values ($1, 'TELLOYA', 1, 'LOCATION')`,
      [planId],
    )
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      )
      values (
        $1, $2, 'GROWTH', 'Growth', 250, false, 8900, 999, 25,
        admin_private.commercial_plan_conditions_hash_v1('GROWTH', 250, false, 8900, 999, 25),
        'APPROVED', $3, now()
      )`,
      [conditionId, planId, admin],
    )
    await db.query(
      `update public.plan_versions
       set status = 'APPROVED', approved_by = $2, approved_at = now()
       where id = $1`,
      [planId, admin],
    )

    expect(await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 1, reason,
    ])).toMatchObject({ status: "terms_unconfigured", reason: "standard_mismatch" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.onboarding_requests
       where enquiry_id = $1 and commercial_subscription_id is not null`,
      [opened.enquiryId],
    ))[0].n).toBe(0)
    expect((await rows<{ n: number }>(
      "select count(*)::int as n from admin_private.job_outbox where topic = 'SEND_EMAIL'",
    ))[0].n).toBeGreaterThanOrEqual(0)

    await db.query(
      `update public.plan_versions
       set status = 'RETIRED', retired_by = $1, retired_at = now()
       where id = $2`,
      [admin, planId],
    )
    await db.query(
      `update public.plan_versions
       set status = 'APPROVED', retired_by = null, retired_at = null, approved_by = $1, approved_at = coalesce(approved_at, now())
       where product_code = 'TELLOYA' and tier_code = 'GROWTH' and amount_minor = 7900 and status = 'RETIRED'`,
      [admin],
    )
  })

  it("blocks queue unless the approved template body exactly matches the composer contract", async () => {
    const opened = await readyEnquiry("r8.composer@example.test", "growth")
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        customAmountPence: null,
        customIncludedMinutes: null,
        customRequirements: "",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Composer contract gate.",
      },
    ])).toMatchObject({ status: "success", version: 1 })
    const prepared = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 1, reason,
    ])
    expect(prepared).toMatchObject({ status: "success" })
    await db.query("insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true) on conflict (singleton) do update set mail_enabled = true")
    await authorizeTestRecipient("r8.composer@example.test", opened.customer_id)

    const nextVersion = (await rows<{ version: number }>(
      `select coalesce(max(version), 0) + 1 as version from admin_private.communication_templates
       where template_key = 'TELLOYA_OFFER'`,
    ))[0].version
    const draftId = (await db.query<{ id: string }>(
      `insert into admin_private.communication_templates(
         template_key, version, name, subject_template, body_text_template, status, reason
       ) values (
         'TELLOYA_OFFER', $1, 'Telloya offer', 'Your Telloya proposal',
         'Generic server-composed Telloya offer email mention without contract fingerprint.',
         'DRAFT', 'server-composed Telloya offer email'
       ) returning id`,
      [nextVersion],
    )).rows[0].id
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
    const draftRow = (await rows<{ record_version: number }>(
      `select record_version from admin_private.communication_templates where id = $1`,
      [draftId],
    ))[0]
    expect(await rpc<Record<string, unknown>>("admin_settings_command_v1", [
      token, randomUUID(), "approve_template_draft", { id: draftId }, draftRow.record_version,
    ])).toMatchObject({ status: "success" })

    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, "https://localhost",
    ])).toMatchObject({ status: "template_unapproved", reason: "composer_contract" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER'`,
      [prepared.subscriptionId],
    ))[0].n).toBe(0)

    // Restore a correct approved body by retiring the wrong version and keeping/creating contract-bound approval.
    await db.query(
      `update admin_private.communication_templates
       set status = 'RETIRED', record_version = record_version + 1
       where id = $1`,
      [draftId],
    )
    const approvedExists = (await rows<{ n: number }>(
      `select count(*)::int as n from admin_private.communication_templates
       where template_key = 'TELLOYA_OFFER' and status = 'APPROVED'
         and body_text_template = admin_private.telloya_offer_composer_contract_body_v1()`,
    ))[0].n
    if (approvedExists === 0) {
      const restoreVersion = (await rows<{ version: number }>(
        `select coalesce(max(version), 0) + 1 as version from admin_private.communication_templates
         where template_key = 'TELLOYA_OFFER'`,
      ))[0].version
      const restoreId = (await db.query<{ id: string }>(
        `insert into admin_private.communication_templates(
           template_key, version, name, subject_template, body_text_template, status, reason
         ) values (
           'TELLOYA_OFFER', $1, 'Telloya offer', 'Your Telloya proposal',
           admin_private.telloya_offer_composer_contract_body_v1(),
           'DRAFT', 'Catalogue row bound to TELLOYA_OFFER_COMPOSER_CONTRACT_V1.'
         ) returning id`,
        [restoreVersion],
      )).rows[0].id
      const restoreRow = (await rows<{ record_version: number }>(
        `select record_version from admin_private.communication_templates where id = $1`,
        [restoreId],
      ))[0]
      await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [token])
      expect(await rpc<Record<string, unknown>>("admin_settings_command_v1", [
        token, randomUUID(), "approve_template_draft", { id: restoreId }, restoreRow.record_version,
      ])).toMatchObject({ status: "success" })
    }
    await db.query("delete from admin_private.telloya_offer_mail_control")
  })

  it("rejects stale draft, unresolved Guard quantity, and Custom without matching approved minutes", async () => {
    const opened = await readyEnquiry("r8.gates@example.test", "growth")
    const saved = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        customAmountPence: null,
        customIncludedMinutes: null,
        customRequirements: "",
        proposedGuardQuantity: 2,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Unresolved Guard quantity.",
      },
    ])
    expect(saved).toMatchObject({ status: "success", version: 1 })
    expect(await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 1, reason,
    ])).toMatchObject({ status: "denied", reason: "guard_unresolved" })
    expect(await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 99, reason,
    ])).toMatchObject({ status: "stale_draft" })

    const custom = await readyEnquiry("r8.custom.miss@example.test", "custom")
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: custom.enquiryId,
        expectedVersion: 0,
        planTier: "custom",
        customAmountPence: 15000,
        customIncludedMinutes: 999,
        customRequirements: "No matching approved minutes",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])).toMatchObject({ status: "success", version: 1 })
    expect(await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), custom.enquiryId, 1, reason,
    ])).toMatchObject({ status: "terms_unconfigured", reason: "custom_approval" })
    expect((await rows<{ n: number }>("select count(*)::int as n from public.commercial_subscriptions")).length).toBeGreaterThanOrEqual(0)
  })
})

describe("Telloya offer mail test-recipient allowlist", () => {
  async function preparedOffer(email: string) {
    const opened = await readyEnquiry(email, "growth")
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: opened.enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        customAmountPence: null,
        customIncludedMinutes: null,
        customRequirements: "",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Allowlist coverage.",
      },
    ])).toMatchObject({ status: "success", version: 1 })
    const prepared = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
      token, randomUUID(), opened.enquiryId, 1, reason,
    ])
    expect(prepared).toMatchObject({ status: "success" })
    return { opened, prepared }
  }

  it("queues when allowlisted, blocks when not, blocks after revoke, and replays once", async () => {
    const email = "r8.allowlist@example.test"
    const { opened, prepared } = await preparedOffer(email)
    await approveTemplate()
    await db.query(
      "insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true) on conflict (singleton) do update set mail_enabled = true",
    )

    const before = (await rows<{ communications: number; outbox: number }>(
      `select
         (select count(*)::int from public.communications where commercial_subscription_id = $1) as communications,
         (select count(*)::int from admin_private.job_outbox where topic = 'SEND_EMAIL') as outbox`,
      [prepared.subscriptionId],
    ))[0]
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, "https://localhost",
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })
    expect((await rows<{ communications: number; outbox: number }>(
      `select
         (select count(*)::int from public.communications where commercial_subscription_id = $1) as communications,
         (select count(*)::int from admin_private.job_outbox where topic = 'SEND_EMAIL') as outbox`,
      [prepared.subscriptionId],
    ))[0]).toEqual(before)

    await authorizeTestRecipient(email, opened.customer_id)
    const queued = await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, "https://localhost",
    ])
    expect(queued).toMatchObject({ status: "queued", deliveryStatus: "NONE" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER' and lifecycle is distinct from 'CANCELLED'`,
      [prepared.subscriptionId],
    ))[0].n).toBe(1)

    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, "https://localhost",
    ])).toMatchObject({ status: "replay", communicationId: queued.communicationId })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications
       where commercial_subscription_id = $1 and template_key = 'TELLOYA_OFFER' and lifecycle is distinct from 'CANCELLED'`,
      [prepared.subscriptionId],
    ))[0].n).toBe(1)

    const other = await preparedOffer("r8.allowlist.other@example.test")
    const beforeOther = (await rows<{ n: number }>(
      `select count(*)::int as n from public.communications where commercial_subscription_id = $1`,
      [other.prepared.subscriptionId],
    ))[0].n
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), other.prepared.subscriptionId, other.prepared.version, "https://localhost",
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications where commercial_subscription_id = $1`,
      [other.prepared.subscriptionId],
    ))[0].n).toBe(beforeOther)

    await db.query(
      `update admin_private.telloya_offer_mail_test_recipients
       set enabled = false, record_version = record_version + 1
       where email_normalized = admin_private.normalize_email_v1($1)`,
      [email],
    )
    // Existing communication still replays; a fresh subscription is blocked after revoke.
    const revoked = await preparedOffer("r8.allowlist.revoked@example.test")
    await authorizeTestRecipient("r8.allowlist.revoked@example.test", revoked.opened.customer_id)
    await db.query(
      `update admin_private.telloya_offer_mail_test_recipients
       set enabled = false, record_version = record_version + 1
       where email_normalized = admin_private.normalize_email_v1($1)`,
      ["r8.allowlist.revoked@example.test"],
    )
    const beforeRevoked = (await rows<{ n: number }>(
      `select count(*)::int as n from public.communications where commercial_subscription_id = $1`,
      [revoked.prepared.subscriptionId],
    ))[0].n
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), revoked.prepared.subscriptionId, revoked.prepared.version, "https://localhost",
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })
    expect((await rows<{ n: number }>(
      `select count(*)::int as n from public.communications where commercial_subscription_id = $1`,
      [revoked.prepared.subscriptionId],
    ))[0].n).toBe(beforeRevoked)

    await db.query("delete from admin_private.telloya_offer_mail_control")
  })

  it("authorises and revokes through telloya_offer_mail_test_recipient_command_v1", async () => {
    const email = "r8.command.allow@example.test"
    const { opened, prepared } = await preparedOffer(email)
    await approveTemplate()
    await db.query(
      "insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true) on conflict (singleton) do update set mail_enabled = true",
    )

    const authorized = await rpc<Record<string, unknown>>("telloya_offer_mail_test_recipient_command_v1", [
      token, randomUUID(), "authorize", {
        email,
        customerId: opened.customer_id,
        note: "command authorize",
      },
    ])
    expect(authorized).toMatchObject({
      status: "success",
      enabled: true,
      emailNormalized: email.toLowerCase(),
    })
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, "https://localhost",
    ])).toMatchObject({ status: "queued", deliveryStatus: "NONE" })

    const revoked = await rpc<Record<string, unknown>>("telloya_offer_mail_test_recipient_command_v1", [
      token, randomUUID(), "revoke", {
        email,
        expectedVersion: authorized.version,
      },
    ])
    expect(revoked).toMatchObject({ status: "success", enabled: false })

    const again = await preparedOffer("r8.command.allow.again@example.test")
    expect(await rpc<Record<string, unknown>>("telloya_offer_mail_v1", [
      token, randomUUID(), again.prepared.subscriptionId, again.prepared.version, "https://localhost",
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })

    await db.query("delete from admin_private.telloya_offer_mail_control")
  })
})
