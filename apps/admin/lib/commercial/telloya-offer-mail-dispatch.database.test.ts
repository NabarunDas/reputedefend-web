/**
 * Disposable PGlite coverage for ADMIN-TY-R8-D-01A-R2-FINAL automatic TELLOYA_OFFER
 * develop-mail dispatch. Replays the repository chain in-process only.
 * No hosted replay, real Resend send, Stripe, or Retell.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { installTelloyaCatalogueFixture } from "./telloya-catalogue.fixture"

const db = new PGlite()
const admin = "c01c0000-0000-4000-8000-00000000ac08"
const token = "ce".repeat(32)
const reason = "Queue a Telloya offer for develop dispatch coverage."
const developOrigin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"

type Json = {
  status?: string
  reason?: string
  jobId?: string
  jobType?: string
  leaseToken?: string
  idempotencyKey?: string
  attempts?: number
  deliveryStatus?: string
  communicationId?: string
  communications?: Array<{ communicationId?: string }>
  firstProviderAttemptAt?: string | null
  providerCallPermitted?: boolean
}

async function rpc<T>(name: string, args: unknown[]) {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

beforeAll(async () => {
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

async function readyEnquiry(email: string) {
  const payload = {
    fullName: "Alex Owner",
    email,
    phone: "07123456789",
    businessName: "Dispatch Yard",
    websiteUrl: "",
    country: "United Kingdom",
    service: "telloya",
    subject: "Telloya receptionist",
    details: "Please set up Telloya.",
    source: "telloya",
    planTier: "growth",
    locations: "London workshop",
    guardInterested: false,
    guardLocationCount: 0,
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
      locationName: "Dispatch Yard floor",
      country: "United Kingdom",
    },
  ])).status).toBe("success")
  current = (await rows<{ record_version: number; customer_id: string; business_id: string }>(
    `select record_version, customer_id, business_id from public.onboarding_requests
     where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
    [enquiryId],
  ))[0]
  return { enquiryId, ...current }
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

async function provisionTestRecipient(email: string, customerId: string) {
  const grantRef = `grant_${randomUUID().replaceAll("-", "")}`
  await db.query(
    `insert into admin_private.telloya_offer_mail_test_owner_grants(
      grant_ref, purpose, bound_customer_id, bound_email_hash, enabled, expires_at, note
    ) values ($1, 'telloya_offer_mail_test', $2, md5(admin_private.normalize_email_v1($3)), true, now() + interval '1 hour', 'disposable')`,
    [grantRef, customerId, email],
  )
  const result = await rpc<Record<string, unknown>>("telloya_offer_mail_test_recipient_provision_v1", [
    grantRef, randomUUID(), customerId, email, "disposable",
  ])
  expect(result).toMatchObject({ status: "success", customerId, enabled: true })
  return result
}

async function preparedOffer(email: string) {
  const opened = await readyEnquiry(email)
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
      notes: "Automatic dispatch coverage.",
    },
  ])).toMatchObject({ status: "success", version: 1 })
  const prepared = await rpc<Record<string, unknown>>("telloya_prepare_offer_from_draft_v1", [
    token, randomUUID(), opened.enquiryId, 1, reason,
  ])
  expect(prepared).toMatchObject({ status: "success" })
  const subscription = (await rows<{ public_ref: string }>(
    "select public_ref from public.commercial_subscriptions where id = $1",
    [prepared.subscriptionId],
  ))[0]
  expect(subscription.public_ref).toMatch(/^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/)
  return { opened, prepared, publicRef: subscription.public_ref }
}

async function ensureActivation() {
  await db.query(
    `insert into admin_private.dev_mail_dispatch_activation(id, active_from, note)
     values (1, now() - interval '1 day', 'Disposable Telloya dispatch activation')
     on conflict (id) do nothing`,
  )
}

async function enableMail() {
  await db.query(
    "insert into admin_private.telloya_offer_mail_control(singleton, mail_enabled) values (true, true) on conflict (singleton) do update set mail_enabled = true",
  )
}

async function expectProviderDenied(communicationId: string, reason: string) {
  expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, developOrigin])).communications
    ?.map(row => row.communicationId)).not.toContain(communicationId)
  expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, developOrigin])).toMatchObject({
    status: "denied", reason,
  })
  expect(await rpc<Json>("communication_begin_provider_attempt_v1", [
    communicationId, 1, `send-email:${communicationId}:v1`,
  ])).toMatchObject({ status: "denied", reason })
  expect((await rows<{
    lifecycle: string
    delivery_status: string
    first_provider_attempt_at: string | null
  }>(
    `select lifecycle, delivery_status, first_provider_attempt_at
     from public.communications where id = $1`,
    [communicationId],
  ))[0]).toEqual({
    lifecycle: "QUEUED",
    delivery_status: "NONE",
    first_provider_attempt_at: null,
  })
}

describe("Telloya offer automatic develop mail dispatch", () => {
  it("includes a queued TELLOYA_OFFER once, denies allowlist revoke, and rejects bad origins", async () => {
    const email = "r8.dispatch.ok@example.test"
    const { opened, prepared, publicRef } = await preparedOffer(email)
    await approveTemplate()
    await enableMail()
    await ensureActivation()
    await provisionTestRecipient(email, opened.customer_id)

    const queued = await rpc<Json>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, developOrigin,
    ])
    expect(queued).toMatchObject({ status: "queued", deliveryStatus: "NONE" })
    const communicationId = String(queued.communicationId)
    const stored = (await rows<{ body_text: string; body_html: string; case_id: string | null }>(
      "select body_text, body_html, case_id from public.communications where id = $1",
      [communicationId],
    ))[0]
    expect(stored.case_id).toBeNull()
    expect(stored.body_text).toContain(`${developOrigin}/portal/onboarding/offer/${publicRef}`)
    expect(stored.body_html).toContain(`${developOrigin}/portal/onboarding/offer/${publicRef}`)
    expect(stored.body_html).toContain("TELLOYA_OFFER_COMPOSER_CONTRACT_V1")

    const listed = await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, developOrigin])
    expect(listed.communications?.map(row => row.communicationId)).toContain(communicationId)

    const claimed = await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, developOrigin])
    expect(claimed).toMatchObject({ status: "success", jobType: "SEND_EMAIL", attempts: 1 })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, developOrigin])).toMatchObject({
      status: "conflict", reason: "leased",
    })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, developOrigin])).toMatchObject({
      status: "conflict", reason: "leased",
    })

    const emailDenied = "r8.dispatch.denied@example.test"
    const denied = await preparedOffer(emailDenied)
    const deniedProvision = await provisionTestRecipient(emailDenied, denied.opened.customer_id)
    const deniedQueued = await rpc<Json>("telloya_offer_mail_v1", [
      token, randomUUID(), denied.prepared.subscriptionId, denied.prepared.version, developOrigin,
    ])
    expect(deniedQueued).toMatchObject({ status: "queued" })
    const deniedId = String(deniedQueued.communicationId)
    const revoked = await rpc<Record<string, unknown>>("telloya_offer_mail_test_recipient_command_v1", [
      token, randomUUID(), "revoke", {
        customerId: denied.opened.customer_id,
        expectedVersion: deniedProvision.version,
      },
    ])
    expect(revoked).toMatchObject({ status: "success", enabled: false })
    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, developOrigin])).communications
      ?.map(row => row.communicationId)).not.toContain(deniedId)
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [deniedId, developOrigin])).toMatchObject({
      status: "denied", reason: "test_recipient_not_allowed",
    })
    expect(await rpc<Json>("communication_begin_provider_attempt_v1", [
      deniedId, 1, `send-email:${deniedId}:v1`,
    ])).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })
    expect((await rows<{ lifecycle: string; delivery_status: string }>(
      "select lifecycle, delivery_status from public.communications where id = $1",
      [deniedId],
    ))[0]).toEqual({ lifecycle: "QUEUED", delivery_status: "NONE" })

    const originBad = "r8.dispatch.origin@example.test"
    const originOffer = await preparedOffer(originBad)
    await provisionTestRecipient(originBad, originOffer.opened.customer_id)
    const originQueued = await rpc<Json>("telloya_offer_mail_v1", [
      token, randomUUID(), originOffer.prepared.subscriptionId, originOffer.prepared.version, developOrigin,
    ])
    expect(originQueued).toMatchObject({ status: "queued" })
    const originId = String(originQueued.communicationId)
    const wrongOrigin = "https://profilerelaunch-customer-git-develop-other.vercel.app"
    const wrongVc = "VC-26-AAAAA2"
    const caseLink = `${developOrigin}/portal/cases/PR-26-MALL2A/documents`
    const composerMarker = "TELLOYA_OFFER_COMPOSER_CONTRACT_V1"
    await db.exec(`
      alter table public.communications disable trigger communications_fulfilment_email_guard;
      alter table public.communications disable trigger communications_protect_snapshot;
    `)
    const originBodies: Array<[string, string, string]> = [
      [
        `Please review your offer.\n${wrongOrigin}/portal/onboarding/offer/${originOffer.publicRef}\n${composerMarker}`,
        `<p>Please review your offer.</p><p><a href="${wrongOrigin}/portal/onboarding/offer/${originOffer.publicRef}">Open</a></p><p>${composerMarker}</p>`,
        "foreign_link",
      ],
      [
        `Please review your offer.\n${developOrigin}/portal/onboarding/offer/${wrongVc}\n${composerMarker}`,
        `<p>Please review your offer.</p><p><a href="${developOrigin}/portal/onboarding/offer/${wrongVc}">Open</a></p><p>${composerMarker}</p>`,
        "origin",
      ],
      [
        `Please review your offer.\n${caseLink}\n${composerMarker}`,
        `<p>Please review your offer.</p><p><a href="${caseLink}">Open</a></p><p>${composerMarker}</p>`,
        "origin",
      ],
    ]
    for (const [text, html, reason] of originBodies) {
      await db.query(
        `update public.communications set body_text = $2, body_html = $3 where id = $1`,
        [originId, text, html],
      )
      expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [originId, developOrigin])).toMatchObject({
        status: "denied", reason,
      })
    }
    await db.exec(`
      alter table public.communications enable trigger communications_protect_snapshot;
      alter table public.communications enable trigger communications_fulfilment_email_guard;
    `)

    const noAllow = await preparedOffer("r8.dispatch.noallow@example.test")
    const noAllowQueued = await rpc<Json>("telloya_offer_mail_v1", [
      token, randomUUID(), noAllow.prepared.subscriptionId, noAllow.prepared.version, developOrigin,
    ])
    expect(noAllowQueued).toMatchObject({ status: "denied", reason: "test_recipient_not_allowed" })

    await db.query("delete from admin_private.telloya_offer_mail_control")
  })

  it("last-mile provider_ready rechecks membership, mail_control, OFFERED, amendment, and email verification", async () => {
    const email = "r8.dispatch.ready@example.test"
    const { opened, prepared } = await preparedOffer(email)
    await approveTemplate()
    await enableMail()
    await ensureActivation()
    await provisionTestRecipient(email, opened.customer_id)

    const queued = await rpc<Json>("telloya_offer_mail_v1", [
      token, randomUUID(), prepared.subscriptionId, prepared.version, developOrigin,
    ])
    expect(queued).toMatchObject({ status: "queued", deliveryStatus: "NONE" })
    const communicationId = String(queued.communicationId)

    const otherBusiness = (await rows<{ id: string }>(
      "insert into public.businesses(display_name) values ('Other Ready Yard') returning id",
    ))[0].id
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
       values ($1, $2, 'verified', now(), $3, $4)`,
      [opened.customer_id, otherBusiness, admin, reason],
    )
    await db.query(
      `update public.business_memberships
       set status = 'revoked', verified_at = null, verified_by = null, evidence = $3
       where customer_id = $1 and business_id = $2`,
      [opened.customer_id, opened.business_id, reason],
    )
    await expectProviderDenied(communicationId, "authority")
    await db.query(
      `update public.business_memberships
       set status = 'verified', verified_at = now(), verified_by = $3, evidence = $4
       where customer_id = $1 and business_id = $2`,
      [opened.customer_id, opened.business_id, admin, reason],
    )

    await db.query(
      "update admin_private.telloya_offer_mail_control set mail_enabled = false where singleton is true",
    )
    await expectProviderDenied(communicationId, "mail_disabled")
    await enableMail()

    const amendmentId = randomUUID()
    await db.query(
      `insert into admin_private.telloya_offer_amendments(
         id, request_id, subscription_id, customer_id, request_text, status, idempotency_key
       ) values ($1, $2, $3, $4, 'Please revise the quotation.', 'REQUESTED', $5)`,
      [amendmentId, randomUUID(), prepared.subscriptionId, opened.customer_id, `amd_${randomUUID().replaceAll("-", "").slice(0, 24)}`],
    )
    await expectProviderDenied(communicationId, "amendment_pending")
    await db.query("delete from admin_private.telloya_offer_amendments where id = $1", [amendmentId])

    await db.query(
      "update public.commercial_subscriptions set state = 'ACCEPTED' where id = $1",
      [prepared.subscriptionId],
    )
    await expectProviderDenied(communicationId, "offer_not_open")
    await db.query(
      "update public.commercial_subscriptions set state = 'OFFERED' where id = $1",
      [prepared.subscriptionId],
    )

    await db.query(
      "delete from public.customer_contact_verifications where customer_id = $1 and channel = 'email'",
      [opened.customer_id],
    )
    await expectProviderDenied(communicationId, "recipient_unverified")
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', $2, $3, $4)`,
      [opened.customer_id, email, admin, reason],
    )

    expect((await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, developOrigin])).communications
      ?.map(row => row.communicationId)).toContain(communicationId)
    const begun = await rpc<Json>("communication_begin_provider_attempt_v1", [
      communicationId, 1, `send-email:${communicationId}:v1`,
    ])
    expect(begun).toMatchObject({ status: "success", providerCallPermitted: true })
    expect(begun.firstProviderAttemptAt).toBeTruthy()
    expect((await rows<{ first_provider_attempt_at: string | null }>(
      "select first_provider_attempt_at from public.communications where id = $1",
      [communicationId],
    ))[0].first_provider_attempt_at).toBeTruthy()

    await db.query("delete from admin_private.telloya_offer_mail_control")
  })

  it("denies case-less non-TELLOYA email and leaves Guided case mail claimable", async () => {
    await ensureActivation()
    const invite = await preparedOffer("r8.dispatch.invite@example.test")
    const onboardingId = (await rows<{ id: string }>(
      `select id from public.onboarding_requests
       where enquiry_id = $1 and state not in ('CLOSED','DECLINED')
       order by created_at desc limit 1`,
      [invite.opened.enquiryId],
    ))[0].id
    const customer = randomUUID()
    const business = randomUUID()
    const location = randomUUID()
    const caseId = randomUUID()
    const caseLess = randomUUID()
    const guided = randomUUID()
    const caseRef = "PR-26-TYDSP2"
    const page = `${developOrigin}/portal/cases/${caseRef}/documents`
    await db.query(
      `insert into public.customers(id, full_name, email) values ($1, 'Dispatch Alex', 'dispatch.alex@example.com')`,
      [customer],
    )
    await db.query(
      `insert into public.businesses(id, display_name) values ($1, 'Dispatch Bakery')`,
      [business],
    )
    await db.query(
      `insert into public.locations(id, business_id, country, location_name) values ($1, $2, 'UK', 'High Street')`,
      [location, business],
    )
    await db.query(
      `insert into public.cases(
        id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
        information_accurate_at, privacy_accepted_at, service_track
      ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,'Profile suspended', now(), now(), 'GUIDED')`,
      [caseId, caseRef, customer, business, location],
    )
    await db.exec("alter table public.communications disable trigger communications_fulfilment_email_guard")
    await db.query(
      `insert into public.communications(
        id, case_id, invitation_request_id, invitation_generation, communication_type, recipient, subject,
        lifecycle, delivery_status, template_key, template_version, body_text, body_html, content_version,
        content_locked, customer_id, business_id, link_key_version
      ) values (
        $1, null, $2, 1, 'CUSTOMER_PORTAL_INVITATION', 'r8.dispatch.invite@example.test', 'Invitation',
        'QUEUED', 'NONE', 'CUSTOMER_PORTAL_INVITATION', 1,
        'Open your portal.', '<p>Open your portal.</p>', 1, true, $3, $4, 1
      )`,
      [caseLess, onboardingId, invite.opened.customer_id, invite.opened.business_id],
    )
    await db.query(
      `insert into public.communications(
        id, case_id, communication_type, recipient, subject, lifecycle, delivery_status, template_key, template_version,
        body_text, body_html, content_version, content_locked, customer_id, business_id
      ) values (
        $1,$2,'CASE_UPDATE','dispatch.alex@example.com','Your documents are ready','QUEUED','NONE','GUIDED_PACK_READY',1,
        $3,$4,1,true,$5,$6
      )`,
      [guided, caseId, `The pack is ready.\n${page}`, `<p>The pack is ready.</p><p>${page}</p>`, customer, business],
    )
    await db.exec("alter table public.communications enable trigger communications_fulfilment_email_guard")
    for (const id of [caseLess, guided]) {
      await db.query(
        `select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'communication', $2::uuid, $3::jsonb, now() - interval '10 minutes')`,
        [`send-email:${id}:v1`, id, JSON.stringify({ communicationId: id, contentVersion: 1 })],
      )
    }
    const listed = (await rpc<Json>("dev_mail_dispatch_candidates_v1", [20, developOrigin])).communications
      ?.map(row => row.communicationId)
    expect(listed).not.toContain(caseLess)
    expect(listed).toContain(guided)
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [caseLess, developOrigin])).toMatchObject({
      status: "denied", reason: "not_send_email",
    })
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [guided, developOrigin])).toMatchObject({
      status: "success", jobType: "SEND_EMAIL",
    })
  })
})
