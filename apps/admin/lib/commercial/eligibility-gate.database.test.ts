/**
 * COM-14A sales-first eligibility on the full migration chain.
 * Decisions in this file exist only inside the disposable test database.
 * The migration does not approve a country or mark the agreement operative.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { eligibilityEnquiryMessage } from "../../../../lib/commercial/eligibility-message"
import { applyChain, preparePlatform } from "../recovery/harness"
import { paidQuoteCommand } from "./paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE } from "./paid-service-approval.fixture"

const db = new PGlite()
const admin = "c14a0000-0000-4000-8000-0000000000a1"
const customer = "c14a0000-0000-4000-8000-0000000000c1"
const customerAuth = "c14a0000-0000-4000-8000-0000000000d1"
const spoofed = "c14a0000-0000-4000-8000-0000000000ff"
const business = "c14a0000-0000-4000-8000-000000000022"
const business2 = "c14a0000-0000-4000-8000-000000000032"
const location = "c14a0000-0000-4000-8000-000000000023"
const locationIe = "c14a0000-0000-4000-8000-000000000033"
const locationDe = "c14a0000-0000-4000-8000-000000000034"
const locationUs = "c14a0000-0000-4000-8000-000000000035"
const locationKp = "c14a0000-0000-4000-8000-000000000036"
const relaunchCase = "c14a0000-0000-4000-8000-000000000024"
const adminToken = "c".repeat(64)
const evidence = "Synthetic accountant file for this test database only. It is not a tax approval."
const destination = "Receiving establishment recorded for this disposable test database only."

type Json = Record<string, unknown> & {
  status?: string
  reason?: string
  id?: string
  version?: number
  quoteVersionId?: string
  message?: string
  providerOperationId?: string
  ok?: boolean
  snapshot?: Record<string, unknown>
}

const key = () => randomUUID()
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const reviewDue = () => new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

async function rpc<T = Json>(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await db.query<{ n: number }>(sql, params)).rows[0]?.n ?? 0)
}

async function priceId(serviceCode: string) {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code = $1 and status = 'APPROVED' order by effective_from desc limit 1",
    [serviceCode],
  )).rows[0].id
}

async function evaluate(businessId: string, service: string, tax: string, amount: number, locationId: string, countAmount = true) {
  return (await db.query<{ value: Json }>(
    "select admin_private.evaluate_commercial_eligibility_v1($1,$2,$3,'GBP',$4,$5,$6) as value",
    [businessId, service, tax, amount, locationId, countAmount],
  )).rows[0].value
}

async function createDraft(serviceCode = "GUIDED_RELAUNCH", extra: Record<string, unknown> = {}) {
  const payload: Record<string, unknown> = {
    customerId: customer,
    businessId: business,
    locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(),
    applyDiscount: false,
    priceVersionId: await priceId(serviceCode),
    serviceCode,
    ...extra,
  }
  if (serviceCode !== "RELAUNCH_GUARD") payload.caseId = relaunchCase
  return rpc("admin_quote_command_v1", [adminToken, key(), "create_draft", payload, null])
}

async function setTax(quoteId: string, version: number, taxBehaviour = "NOT_APPLICABLE", extra: Record<string, unknown> = {}) {
  return rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", { quoteId, taxBehaviour, ...extra }, version])
}

async function offer(quoteId: string, version: number, extra: Record<string, unknown> = {}) {
  return rpc("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId, ...extra }, version])
}

async function draftAndTax(serviceCode = "GUIDED_RELAUNCH", tax = "NOT_APPLICABLE") {
  const draft = await createDraft(serviceCode)
  expect(draft?.status).toBe("success")
  const taxed = await setTax(draft!.id!, draft!.version!, tax)
  expect(taxed?.status).toBe("success")
  return { draft: draft!, taxed: taxed! }
}

function decisionPayload(overrides: Record<string, unknown> = {}) {
  return {
    countryCode: "NZ",
    serviceClass: "GUIDED",
    paymentFlow: "CHECKOUT_UPFRONT",
    status: "APPROVED",
    taxDetermination: "OUTSIDE_UK_PLACE_OF_SUPPLY",
    sellerRegistrationStatus: "NOT_VAT_REGISTERED",
    stripeFlowReady: true,
    presentmentMode: "GBP_ONLY",
    destinationRequirements: destination,
    evidenceReference: evidence,
    reviewDueAt: reviewDue(),
    actorId: spoofed,
    approvedBy: spoofed,
    country: "UK",
    currency: "EUR",
    ...overrides,
  }
}

async function recordDecision(overrides: Record<string, unknown> = {}, request = key()) {
  return {
    request,
    result: await rpc("admin_record_eligibility_decision_v1", [adminToken, request, decisionPayload(overrides)]),
  }
}

async function recordEstablishment(overrides: Record<string, unknown> = {}, request = key()) {
  return rpc("admin_record_business_establishment_v1", [adminToken, request, {
    businessId: business,
    countryCode: "IE",
    legalName: "Synthetic Harbour Bakery Ltd",
    registrationId: "SYNTHETIC-IE",
    evidenceType: "REGISTRY_EXTRACT",
    evidenceReference: evidence,
    verificationStatus: "VERIFIED",
    actorId: spoofed,
    country: "GB",
    currency: "EUR",
    ...overrides,
  }])
}

async function issueAcceptance(quoteId: string) {
  const secret = hash(randomBytes(32).toString("hex"))
  const issued = await rpc("admin_quote_command_v1", [adminToken, key(), "create_quote_acceptance_action", {
    quoteId, expiresAt: actionExpiry(), secretHash: secret,
  }, null])
  expect(issued?.status).toBe("success")
  const pending = hash(randomBytes(32).toString("hex"))
  const session = hash(randomBytes(32).toString("hex"))
  expect(await rpc("customer_action_exchange_v1", [issued.id, secret, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
  return { issued, session }
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
    insert into public.businesses(id, display_name) values
      ('${business}', 'Harbour Bakery'),
      ('${business2}', 'Second Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'UK', 'High Street'),
      ('${locationIe}', '${business2}', 'IE', 'Dublin'),
      ('${locationDe}', '${business2}', 'DE', 'Berlin'),
      ('${locationUs}', '${business2}', 'US', 'Austin'),
      ('${locationKp}', '${business2}', 'KP', 'Restricted');
    insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, created_at, information_accurate_at, privacy_accepted_at, service_track
    ) values (
      '${relaunchCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${location}', 'Profile suspended', '2026-01-01', now(), now(), 'UNDECIDED'
    );
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${customer}', 'email', 'alex@example.com', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${business}', 'verified', now(), '${admin}', 'Companies House match discussed on a live call.');
  `)
}, 180000)

afterAll(async () => { await db.close() })

describe("COM-14A commercial eligibility gate", () => {
  it("records the seller VAT position without seeding or approving a country", async () => {
    expect(await count("select count(*)::int as n from public.commercial_eligibility_decisions")).toBe(0)
    expect(await count("select count(*)::int as n from public.commercial_sanctions_restrictions")).toBe(0)
    const seller = await db.query<{ status: string; evidence_reference: string }>(
      "select status, evidence_reference from public.seller_vat_position",
    )
    expect(seller.rows).toEqual([{
      status: "NOT_VAT_REGISTERED",
      evidence_reference: "ProfileRelaunch Ltd is not VAT registered. This records that fact. It is not a zero-rating and it does not authorise overseas sales.",
    }])
    const catalogue = await db.query<{ status: string; operative: boolean }>(
      "select status, operative from public.paid_service_agreement_catalogue",
    )
    expect(catalogue.rows).toEqual([{ status: "SOLICITOR_REVIEW", operative: false }])
    const enquiry = await db.query<{ def: string }>(
      "select pg_get_functiondef('public.create_general_enquiry_v1(uuid,jsonb,boolean)'::regprocedure) as def",
    )
    expect(enquiry.rows[0].def).not.toContain("commercial_eligibility")
  })

  it("refuses anonymous, browser and service-role writes while the operator RPCs stay callable by the server role", async () => {
    const privileges = await db.query<{ anon_decision: boolean; auth_establishment: boolean; service_decision: boolean; service_evaluate: boolean }>(`
      select
        has_function_privilege('anon', 'public.admin_record_eligibility_decision_v1(text,uuid,jsonb)', 'EXECUTE') as anon_decision,
        has_function_privilege('authenticated', 'public.admin_record_business_establishment_v1(text,uuid,jsonb)', 'EXECUTE') as auth_establishment,
        has_function_privilege('service_role', 'public.admin_record_eligibility_decision_v1(text,uuid,jsonb)', 'EXECUTE') as service_decision,
        has_function_privilege('service_role', 'admin_private.evaluate_commercial_eligibility_v1(uuid,text,text,text,integer,uuid,boolean)', 'EXECUTE') as service_evaluate
    `)
    expect(privileges.rows[0]).toEqual({
      anon_decision: false,
      auth_establishment: false,
      service_decision: true,
      service_evaluate: false,
    })
    await db.exec("SET ROLE service_role")
    try {
      await expect(db.query(
        "select admin_private.evaluate_commercial_eligibility_v1($1::uuid, 'GUIDED_RELAUNCH', 'NOT_APPLICABLE', 'GBP', 9900, $2::uuid, true)",
        [business, location],
      )).rejects.toThrow(/permission denied/i)
      await expect(db.query(
        `insert into public.commercial_eligibility_decisions(
          request_id, country_code, service_class, payment_flow, b2b_requirement, destination_requirements,
          seller_registration_status, status, effective_from, review_due_at, evidence_reference, decision_version, payload_fingerprint
        ) values ($1,'GB','GUIDED','CHECKOUT_UPFRONT','B2B_VERIFIED',$2,'UNKNOWN','PENDING_REVIEW', now(), now() + interval '1 day', $2, 99, 'spoof')`,
        [key(), destination],
      )).rejects.toThrow(/permission denied/i)
      await expect(db.query(
        `insert into public.commercial_sanctions_restrictions(country_code, reason) values ('KP', $1)`,
        [destination],
      )).rejects.toThrow(/permission denied/i)
      await expect(db.query(
        `insert into public.commercial_tax_log(
          event, business_id, country_code, seller_vat_status, contract_amount_minor, currency, details
        ) values ('ACCEPTED', $1, 'GB', 'NOT_VAT_REGISTERED', 100, 'GBP', '{}'::jsonb)`,
        [business],
      )).rejects.toThrow(/permission denied/i)
    } finally {
      await db.exec("RESET ROLE")
    }
  })

  it("keeps an enquiry and a draft open when the Google listing is not a confirmed purchasing business", async () => {
    const enquiry = await rpc("create_general_enquiry_v1", [key(), {
      fullName: "Alex Morgan", email: "alex@example.com", phone: "07123456789", businessName: "Example Bakery",
      country: "IN", service: "general", subject: "general-question",
      details: "Our Google listing was suspended last week and we cannot get it back.",
      websiteUrl: "", businessProfileUrl: "", reviewUrl: "", informationAccurate: false, privacyAccepted: false, source: "contact",
    }, false])
    expect(enquiry.status).toBe("created")
    expect(await count("select count(*)::int as n from public.service_orders")).toBe(0)
    expect(await count("select count(*)::int as n from public.commercial_eligibility_decisions")).toBe(0)

    const { draft, taxed } = await draftAndTax()
    expect(await count("select count(*)::int as n from public.quote_versions where id = $1 and status = 'DRAFT'", [draft.quoteVersionId])).toBe(1)
    const offered = await offer(draft.id!, taxed.version!, { country: "GB", countryCode: "GB", currency: "GBP" })
    expect(offered).toMatchObject({
      status: "denied", reason: "unresolved_establishment", message: eligibilityEnquiryMessage,
    })
    expect(await count("select count(*)::int as n from public.quote_versions where id = $1 and status = 'DRAFT'", [draft.quoteVersionId])).toBe(1)
    expect(await count("select count(*)::int as n from public.quote_versions where id = $1 and status = 'OFFERED'", [draft.quoteVersionId])).toBe(0)
    expect(await evaluate(business, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 9900, location)).toMatchObject({
      ok: false, reason: "unresolved_establishment", message: eligibilityEnquiryMessage,
    })
    expect((await db.query<{ country: string }>("select country from public.locations where id = $1", [location])).rows[0].country).toBe("UK")

    const unconfirmed = await draftAndTax("GUIDED_RELAUNCH", "UNCONFIRMED")
    expect((await offer(unconfirmed.draft.id!, unconfirmed.taxed.version!))?.status).toBe("denied")
    expect(await count("select count(*)::int as n from public.quote_versions where id = $1 and status = 'OFFERED'", [unconfirmed.draft.quoteVersionId])).toBe(0)

    const directVersion = key()
    const directQuote = key()
    const directSnapshot = key()
    const price = await priceId("GUIDED_RELAUNCH")
    await db.query(
      `insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
        policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN','GUIDED_RELAUNCH','NONE',0,'NOT_QUALIFIED','SYNTHETIC',9900,0,9900,$3,'ADMIN_RECORDED')`,
      [directSnapshot, location, admin],
    )
    await db.query(
      "insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by) values ($1,'QT-26-CMUNCQ',$2,$3,$4,$5,'OFFERED',$6)",
      [directQuote, customer, business, location, relaunchCase, admin],
    )
    await db.query(
      `insert into public.quote_versions(
        id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor,
        currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
      ) values (
        $1,$2,1,'OFFERED',$3,$4,$5,$6,'GUIDED_RELAUNCH',$7,'GUIDED_RELAUNCH','UPFRONT',
        'We prepare the service for this location.','Work outside this quotation is excluded.','The service terms define the fee.',
        9900,'NONE',0,0,9900,'UNCONFIRMED',0,9900,'GBP',$8, now() + interval '30 days',
        'Payment follows the accepted service terms.','The paid-service agreement named on this quotation applies.',$9, now(), $9
      )`,
      [directVersion, directQuote, customer, business, location, relaunchCase, price, directSnapshot, admin],
    )
    await db.query("update public.quotes set current_version_id = $1 where id = $2", [directVersion, directQuote])
    const actionId = key()
    const secret = hash(key())
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8)`,
      [actionId, customer, business, location, relaunchCase, directVersion, secret, admin],
    )
    const session = hash(key())
    await db.query(
      "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) values ($1,$2,$3, now() + interval '1 day')",
      [session, actionId, customerAuth],
    )
    expect(await rpc("accept_paid_service_terms_v1", [session, key(), {
      quoteVersionId: directVersion,
      businessPurpose: { accepted: true },
      terms: { accepted: true, version: "PS-2026-10-14.2", hash: "ab".repeat(32) },
      feeBasis: null,
    }])).toMatchObject({ status: "tax_unconfirmed" })
    expect(await count("select count(*)::int as n from public.service_orders")).toBe(0)

    const listedVersion = key()
    const listedQuote = key()
    const listedSnapshot = key()
    const listedAcceptance = key()
    const listedAction = key()
    const listedOrder = key()
    await db.query(
      `insert into public.quote_discount_snapshots(
        id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
        policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
        discounted_subtotal_minor, recorded_by, source
      ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN','GUIDED_RELAUNCH','NONE',0,'NOT_QUALIFIED','SYNTHETIC',9900,0,9900,$3,'ADMIN_RECORDED')`,
      [listedSnapshot, location, admin],
    )
    await db.query(
      "insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by) values ($1,'QT-26-CMAAAC',$2,$3,$4,$5,'OFFERED',$6)",
      [listedQuote, customer, business, location, relaunchCase, admin],
    )
    await db.query(
      `insert into public.quote_versions(
        id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor,
        currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
      ) values (
        $1,$2,1,'OFFERED',$3,$4,$5,$6,'GUIDED_RELAUNCH',$7,'GUIDED_RELAUNCH','UPFRONT',
        'We prepare the service for this location.','Work outside this quotation is excluded.','The service terms define the fee.',
        9900,'NONE',0,0,9900,'NOT_APPLICABLE',0,9900,'GBP',$8, now() + interval '30 days',
        'Payment follows the accepted service terms.','The paid-service agreement named on this quotation applies.',$9, now(), $9
      )`,
      [listedVersion, listedQuote, customer, business, location, relaunchCase, price, listedSnapshot, admin],
    )
    await db.query(
      `insert into public.customer_actions(
        id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash, expected_email_snapshot, expires_at, created_by
      ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8)`,
      [listedAction, customer, business, location, relaunchCase, listedVersion, hash(key()), admin],
    )
    await db.query(
      `insert into public.quote_acceptances(
        id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
        total_amount_minor, currency, tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,'alex@example.com',9900,'GBP','NOT_APPLICABLE',0)`,
      [listedAcceptance, listedQuote, listedVersion, listedAction, customerAuth],
    )
    await db.query(
      `insert into public.service_orders(
        id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
        service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
      ) values ($1,'SO-26-CMAAAC',$2,$3,$4,$5,$6,$7,$8,'GUIDED_RELAUNCH',9900,'GBP','UPFRONT','NOT_APPLICABLE',0,'ACCEPTED_AWAITING_PAYMENT', now())`,
      [listedOrder, listedQuote, listedVersion, listedAcceptance, customer, business, location, relaunchCase],
    )
    await expect(db.query(
      `insert into public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, status)
       values ($1,'CREATE_CHECKOUT_SESSION','UPFRONT',$2,$3,'PENDING')`,
      [key(), customer, listedOrder],
    )).rejects.toThrow(/commercial_eligibility:unresolved_establishment/)
    await expect(db.query(
      `insert into public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, status)
       values ($1,'CREATE_INVOICE','INVOICE',$2,$3,'PENDING')`,
      [key(), customer, listedOrder],
    )).rejects.toThrow(/commercial_eligibility:unresolved_establishment/)
    expect(await count("select count(*)::int as n from public.provider_operations where service_order_id = $1", [listedOrder])).toBe(0)
  })

  it("rejects a missing session, a spoofed actor, bad evidence, a worldwide zero shortcut and a mismatched flow", async () => {
    expect(await rpc("admin_record_eligibility_decision_v1", [hash("missing"), key(), decisionPayload()])).toMatchObject({ status: "unauthorised" })
    expect(await rpc("admin_record_business_establishment_v1", [hash("missing"), key(), {
      businessId: business, countryCode: "IE", legalName: "Synthetic Harbour Bakery Ltd", evidenceType: "REGISTRY_EXTRACT",
      evidenceReference: evidence, verificationStatus: "VERIFIED",
    }])).toMatchObject({ status: "unauthorised" })

    const approved = await recordDecision()
    expect(approved.result.status).toBe("success")
    const stored = await db.query<{ approved_by: string; country_code: string }>(
      "select approved_by, country_code from public.commercial_eligibility_decisions where id = $1",
      [approved.result.id],
    )
    expect(stored.rows[0]).toEqual({ approved_by: admin, country_code: "NZ" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, approved.request, decisionPayload()])).toMatchObject({
      status: "replay", id: approved.result.id,
    })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, approved.request, decisionPayload({
      evidenceReference: `${evidence} A different file.`,
    })])).toMatchObject({ status: "conflict" })

    const probe = await db.query<{ rejected: boolean }>(
      "select admin_private.eligibility_evidence_rejected_v1('worldwide zero-rated','AU','GUIDED','CHECKOUT_UPFRONT') as rejected",
    )
    expect(probe.rows[0].rejected).toBe(true)
    for (const phrase of ["worldwide zero-rated", "worldwide zero rated", "Accountant approved AU GUIDED CHECKOUT_UPFRONT."]) {
      const rejected = await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
        countryCode: "AU", evidenceReference: phrase,
      })])
      expect(rejected, JSON.stringify({ phrase, rejected })).toMatchObject({ status: "invalid", reason: "evidence_rejected" })
    }
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      evidenceReference: "The note claims worldwide zero treatment for this supply.",
    })])).toMatchObject({ status: "invalid", reason: "evidence_rejected" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      evidenceReference: "zero",
    })])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      taxDetermination: "WORLDWIDE_ZERO",
    })])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      taxDetermination: "NOT_VAT_MEANS_ZERO",
    })])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      countryCode: "DE", taxDetermination: "UK_DOMESTIC_NOT_VAT_REGISTERED",
    })])).toMatchObject({ status: "invalid", reason: "not_vat_is_not_worldwide_zero" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      countryCode: "US", taxDetermination: "OUTSIDE_UK_PLACE_OF_SUPPLY",
    })])).toMatchObject({ status: "invalid", reason: "subdivision_required" })
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      countryCode: "CA", subdivisionCode: "ON", taxDetermination: "OUTSIDE_UK_PLACE_OF_SUPPLY",
    })])).toMatchObject({ status: "success" })
    for (const countryCode of ["EU", "UK", "XX"]) {
      expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({ countryCode })])).toMatchObject({ status: "invalid" })
    }
    expect(await rpc("admin_record_eligibility_decision_v1", [adminToken, key(), decisionPayload({
      serviceClass: "GUIDED", paymentFlow: "GUARD_RECURRING",
    })])).toMatchObject({ status: "invalid" })
    expect(await rpc("admin_record_business_establishment_v1", [adminToken, key(), {
      businessId: business, countryCode: "US", legalName: "Synthetic Harbour Bakery Ltd", evidenceType: "REGISTRY_EXTRACT",
      evidenceReference: evidence, verificationStatus: "VERIFIED",
    }])).toMatchObject({ status: "invalid", reason: "subdivision_required" })
  })

  it("stops a sanctioned country even when an approval row has been inserted", async () => {
    await db.query(
      `insert into public.commercial_sanctions_restrictions(country_code, reason) values ('KP', $1)`,
      ["Synthetic sanctions restriction for this disposable test database only."],
    )
    expect((await recordDecision({ countryCode: "KP" })).result).toMatchObject({ status: "invalid", reason: "sanctions_blocked" })
    await db.query(
      `insert into public.commercial_eligibility_decisions(
        request_id, country_code, service_class, payment_flow, b2b_requirement, tax_determination,
        destination_requirements, seller_registration_status, stripe_flow_ready, presentment_mode,
        status, effective_from, review_due_at, approved_by, evidence_reference, decision_version, payload_fingerprint
      ) values ($1,'KP','GUIDED','CHECKOUT_UPFRONT','B2B_VERIFIED','OUTSIDE_UK_PLACE_OF_SUPPLY',$2,
        'NOT_VAT_REGISTERED', true, 'GBP_ONLY', 'APPROVED', now(), now() + interval '30 days', $3, $4, 1, 'sanction-bypass')`,
      [key(), destination, admin, evidence],
    )
    expect(await recordEstablishment({
      businessId: business2, countryCode: "KP", legalName: "Synthetic Restricted Bakery Ltd", registrationId: "SYNTHETIC-KP",
    })).toMatchObject({ status: "success", countryCode: "KP" })
    expect(await evaluate(business2, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 5000, location)).toMatchObject({
      ok: false, reason: "sanctions_blocked", message: eligibilityEnquiryMessage,
    })
    expect(await evaluate(business, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 5000, location)).toMatchObject({
      ok: false, reason: "unresolved_establishment",
    })
  })

  it("reuses one Ireland decision and does not transfer it to Germany, Guard or an expired approval", async () => {
    expect(await recordEstablishment()).toMatchObject({ status: "success", countryCode: "IE" })
    expect((await db.query<{ country: string }>("select country from public.locations where id = $1", [location])).rows[0].country).toBe("UK")
    const beforeDecision = await draftAndTax()
    expect(await offer(beforeDecision.draft.id!, beforeDecision.taxed.version!)).toMatchObject({
      status: "denied", reason: "awaiting_confirmation", message: eligibilityEnquiryMessage,
    })
    const ie = await recordDecision({
      countryCode: "IE",
      presentmentMode: "LOCAL_AFTER_ELIGIBILITY",
      presentmentCurrency: "EUR",
      taxDetermination: "OUTSIDE_UK_PLACE_OF_SUPPLY",
    })
    expect(ie.result.status).toBe("success")
    const { draft, taxed } = await draftAndTax()
    const offered = await offer(draft.id!, taxed.version!, { countryCode: "DE", currency: "USD" })
    expect(offered.status).toBe("success")
    const snapshot = await db.query<{ eligibility_snapshot: Record<string, unknown> }>(
      "select eligibility_snapshot from public.quote_versions where id = $1",
      [draft.quoteVersionId],
    )
    expect(snapshot.rows[0].eligibility_snapshot).toMatchObject({
      countryCode: "IE",
      serviceClass: "GUIDED",
      contractCurrency: "GBP",
      presentmentCurrency: "EUR",
      presentmentAmountMinor: null,
      fxRate: null,
      source: "decision",
    })
    expect(await recordEstablishment({
      businessId: business2, countryCode: "IE", registrationId: "SYNTHETIC-IE-2", supersede: "true",
    })).toMatchObject({ status: "success", countryCode: "IE" })
    expect(await evaluate(business2, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 5000, location)).toMatchObject({
      ok: true,
      snapshot: { countryCode: "IE", source: "decision", decisionId: ie.result.id },
    })
    expect(await recordEstablishment({
      businessId: business2, countryCode: "DE", registrationId: "SYNTHETIC-DE-2", supersede: "true",
    })).toMatchObject({ status: "success", countryCode: "DE" })
    expect(await evaluate(business2, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 5000, location)).toMatchObject({
      ok: false, reason: "awaiting_confirmation", message: eligibilityEnquiryMessage,
    })

    const guard = await draftAndTax("RELAUNCH_GUARD")
    expect(await offer(guard.draft.id!, guard.taxed.version!)).toMatchObject({
      status: "denied", reason: "awaiting_confirmation", message: eligibilityEnquiryMessage,
    })
    const managed = await draftAndTax("MANAGED_RELAUNCH")
    expect(await offer(managed.draft.id!, managed.taxed.version!)).toMatchObject({
      status: "denied", reason: "awaiting_confirmation",
    })

    const expiring = await draftAndTax()
    expect((await offer(expiring.draft.id!, expiring.taxed.version!)).status).toBe("success")
    const opened = await issueAcceptance(expiring.draft.id!)
    const confirmed = await rpc("admin_confirm_paid_service_agreement_v1", [adminToken, key(), SYNTHETIC_APPROVAL_EVIDENCE])
    expect(confirmed.status).toBe("confirmed")
    const expired = await recordDecision({
      countryCode: "IE",
      presentmentMode: "LOCAL_AFTER_ELIGIBILITY",
      presentmentCurrency: "EUR",
      taxDetermination: "OUTSIDE_UK_PLACE_OF_SUPPLY",
      effectiveUntil: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(expired.result.status).toBe("success")
    const ordersBefore = await count("select count(*)::int as n from public.service_orders")
    const communications = await count("select count(*)::int as n from public.communications")
    const blocked = await rpc("customer_action_command_v1", [opened.session, key(), "accept", paidQuoteCommand({
      quoteVersionId: expiring.draft.quoteVersionId!,
      serviceCode: "GUIDED_RELAUNCH",
    })])
    expect(blocked).toMatchObject({ status: "eligibility_blocked", reason: "expired", message: eligibilityEnquiryMessage })
    expect(await count("select count(*)::int as n from public.service_orders")).toBe(ordersBefore)
    expect(await count("select count(*)::int as n from public.communications")).toBe(communications)
    expect(await count("select count(*)::int as n from public.paid_service_acceptances")).toBe(0)

    expect(await recordEstablishment({ countryCode: "DE", registrationId: "SYNTHETIC-DE" })).toMatchObject({
      status: "conflict", reason: "conflicting_establishment",
    })
    expect(await recordEstablishment({
      countryCode: "DE", registrationId: "SYNTHETIC-DE", supersede: "true",
    })).toMatchObject({ status: "success", countryCode: "DE" })
    const moved = await draftAndTax()
    expect(await offer(moved.draft.id!, moved.taxed.version!)).toMatchObject({
      status: "denied", reason: "awaiting_confirmation", message: eligibilityEnquiryMessage,
    })
    expect(await count("select count(*)::int as n from public.service_orders")).toBe(ordersBefore)
  })

  it("accepts one UK sale, logs it, and refuses the cached checkout once the flow is blocked", async () => {
    expect(await recordEstablishment({
      countryCode: "GB", registrationId: "", taxId: "", evidenceType: "OTHER", supersede: "true",
    })).toMatchObject({ status: "success", countryCode: "GB" })
    expect((await db.query<{ tax_id: string | null; registration_id: string | null }>(
      "select tax_id, registration_id from public.business_establishments where business_id = $1 and superseded_at is null",
      [business],
    )).rows[0]).toEqual({ tax_id: null, registration_id: null })
    expect(await count("select count(*)::int as n from public.commercial_eligibility_decisions where country_code = 'GB' and status = 'APPROVED'")).toBe(0)
    const exclusive = await createDraft()
    const exclusiveTax = await setTax(exclusive!.id!, exclusive!.version!, "EXCLUSIVE", { taxRateBps: 2000 })
    expect(exclusiveTax?.status).toBe("success")
    expect(await offer(exclusive!.id!, exclusiveTax!.version!)).toMatchObject({
      status: "denied", reason: "tax_determination_mismatch", message: eligibilityEnquiryMessage,
    })
    const confirmed = await rpc("admin_confirm_paid_service_agreement_v1", [adminToken, key(), SYNTHETIC_APPROVAL_EVIDENCE])
    expect(["confirmed", "already_confirmed"]).toContain(confirmed.status)

    const ready = await draftAndTax()
    expect((await offer(ready.draft.id!, ready.taxed.version!)).status).toBe("success")
    const opened = await issueAcceptance(ready.draft.id!)
    const accepted = await rpc("customer_action_command_v1", [opened.session, key(), "accept", paidQuoteCommand({
      quoteVersionId: ready.draft.quoteVersionId!,
      serviceCode: "GUIDED_RELAUNCH",
    })])
    expect(accepted.status).toBe("success")
    const acceptance = await db.query<{ id: string; eligibility_snapshot: Record<string, unknown> }>(
      "select id, eligibility_snapshot from public.paid_service_acceptances where quote_version_id = $1",
      [ready.draft.quoteVersionId],
    )
    expect(acceptance.rows[0].eligibility_snapshot).toMatchObject({
      countryCode: "GB",
      taxDetermination: "UK_DOMESTIC_NOT_VAT_REGISTERED",
      contractCurrency: "GBP",
      stripeFlowReady: false,
      source: "uk_not_vat_registered",
      decisionId: null,
      fxRate: null,
    })
    expect(await count(
      "select count(*)::int as n from public.commercial_tax_log where event = 'ACCEPTED' and source_id = $1 and country_code = 'GB' and currency = 'GBP'",
      [acceptance.rows[0].id],
    )).toBe(1)
    const order = (await db.query<{ id: string; record_version: number }>(
      "select id, record_version from public.service_orders where quote_version_id = $1",
      [ready.draft.quoteVersionId],
    )).rows[0]
    const secret = hash(randomBytes(32).toString("hex"))
    const issued = await rpc("admin_payment_command_v1", [adminToken, key(), "issue_guided_payment_action", {
      serviceOrderId: order.id, expiresAt: actionExpiry(), secretHash: secret,
    }, order.record_version])
    expect(issued?.status).toBe("success")
    const pending = hash(randomBytes(32).toString("hex"))
    const session = hash(randomBytes(32).toString("hex"))
    expect(await rpc("customer_action_exchange_v1", [issued.id, secret, pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })

    const request = key()
    const first = await rpc("customer_payment_command_v1", [session, request, "start_checkout", { idempotencyKey: request }])
    expect(first.status).toBe("success")
    expect(first.providerOperationId).toBeTruthy()
    expect(await count(
      "select count(*)::int as n from public.provider_operations where service_order_id = $1 and kind = 'CREATE_CHECKOUT_SESSION'",
      [order.id],
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.commercial_tax_log where event = 'PAYMENT_ATTEMPT' and source_id = $1",
      [first.providerOperationId],
    )).toBe(1)
    const turnover = Number((await db.query<{ n: string }>("select admin_private.uk_vat_turnover_minor_v1()::text as n")).rows[0].n)
    const acceptedTotal = Number((await db.query<{ n: string }>(
      "select coalesce(sum(contract_amount_minor), 0)::text as n from public.commercial_tax_log where event = 'ACCEPTED' and country_code = 'GB'",
    )).rows[0].n)
    expect(turnover).toBe(acceptedTotal)
    const replay = await rpc("customer_payment_command_v1", [session, request, "start_checkout", { idempotencyKey: request }])
    expect(replay).toMatchObject({ status: "success", providerOperationId: first.providerOperationId })

    const blocked = await recordDecision({
      countryCode: "GB",
      status: "BLOCKED",
      taxDetermination: "UK_DOMESTIC_NOT_VAT_REGISTERED",
      evidenceReference: `${evidence} This flow is blocked for the test.`,
    })
    expect(blocked.result.status).toBe("success")
    const sameRequest = await rpc("customer_payment_command_v1", [session, request, "start_checkout", { idempotencyKey: request }])
    expect(sameRequest).toMatchObject({ status: "eligibility_blocked", reason: "blocked", message: eligibilityEnquiryMessage })
    expect(sameRequest.providerOperationId).toBeUndefined()
    const fresh = await rpc("customer_payment_command_v1", [session, key(), "start_checkout", { idempotencyKey: key() }])
    expect(fresh).toMatchObject({ status: "eligibility_blocked", reason: "blocked" })
    expect(await count(
      "select count(*)::int as n from public.provider_operations where service_order_id = $1 and kind = 'CREATE_CHECKOUT_SESSION'",
      [order.id],
    )).toBe(1)
    await expect(db.query(
      `insert into public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, status)
       values ($1,'CREATE_INVOICE','INVOICE',$2,$3,'PENDING')`,
      [key(), customer, order.id],
    )).rejects.toThrow(/commercial_eligibility:blocked/)
    const next = await draftAndTax()
    expect(await offer(next.draft.id!, next.taxed.version!)).toMatchObject({
      status: "denied", reason: "blocked", message: eligibilityEnquiryMessage,
    })
  })

  it("alerts as UK turnover approaches £90,000 and stops a new not-applicable sale at the threshold", async () => {
    const pending = await recordDecision({
      countryCode: "GB",
      status: "PENDING_REVIEW",
      sellerRegistrationStatus: "UNKNOWN",
      stripeFlowReady: false,
      taxDetermination: null,
      evidenceReference: `${evidence} A pending note is not an approval.`,
    })
    expect(pending.result.status).toBe("success")
    const before = Number((await db.query<{ n: string }>("select admin_private.uk_vat_turnover_minor_v1()::text as n")).rows[0].n)
    expect(before).toBeLessThan(7200000)
    await db.query(
      `insert into public.commercial_tax_log(
        event, business_id, location_id, country_code, service_code, service_class, payment_flow,
        tax_behaviour, tax_determination, seller_vat_status, contract_amount_minor, currency, details
      ) values (
        'PAYMENT_ATTEMPT', $1, $2, 'GB', 'GUIDED_RELAUNCH', 'GUIDED', 'CHECKOUT_UPFRONT',
        'NOT_APPLICABLE', 'UK_DOMESTIC_NOT_VAT_REGISTERED', 'NOT_VAT_REGISTERED', 5000000, 'GBP', '{}'::jsonb
      )`,
      [business, location],
    )
    expect(Number((await db.query<{ n: string }>("select admin_private.uk_vat_turnover_minor_v1()::text as n")).rows[0].n)).toBe(before)
    await db.query(
      `insert into public.commercial_tax_log(
        event, business_id, location_id, country_code, service_code, service_class, payment_flow,
        tax_behaviour, tax_determination, seller_vat_status, contract_amount_minor, currency, turnover_minor_after, details
      ) values (
        'ACCEPTED', $1, $2, 'GB', 'GUIDED_RELAUNCH', 'GUIDED', 'CHECKOUT_UPFRONT',
        'NOT_APPLICABLE', 'UK_DOMESTIC_NOT_VAT_REGISTERED', 'NOT_VAT_REGISTERED', $3, 'GBP', $4, '{}'::jsonb
      )`,
      [business, location, 7200000 - before - 1, 7200000 - 1],
    )
    const approaching = await evaluate(business, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 1, location, true)
    expect(approaching).toMatchObject({ ok: true, snapshot: { alert: "APPROACHING" } })
    const recorded = await evaluate(business, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 20000, location, false)
    expect(recorded.ok).toBe(true)
    expect(recorded.snapshot?.alert ?? null).toBeNull()
    await db.query(
      `insert into public.commercial_tax_log(
        event, business_id, location_id, country_code, service_code, service_class, payment_flow,
        tax_behaviour, tax_determination, seller_vat_status, contract_amount_minor, currency, details
      ) values (
        'ACCEPTED', $1, $2, 'GB', 'GUIDED_RELAUNCH', 'GUIDED', 'CHECKOUT_UPFRONT',
        'NOT_APPLICABLE', 'UK_DOMESTIC_NOT_VAT_REGISTERED', 'NOT_VAT_REGISTERED', 1800001, 'GBP', '{}'::jsonb
      )`,
      [business, location],
    )
    expect(await evaluate(business, "GUIDED_RELAUNCH", "NOT_APPLICABLE", 1, location, true)).toMatchObject({
      ok: false, reason: "vat_threshold", message: eligibilityEnquiryMessage,
    })
    const held = await draftAndTax()
    expect(await offer(held.draft.id!, held.taxed.version!)).toMatchObject({
      status: "denied", reason: "vat_threshold", message: eligibilityEnquiryMessage,
    })
    expect(await count("select count(*)::int as n from public.quote_versions where id = $1 and status = 'OFFERED'", [held.draft.quoteVersionId])).toBe(0)
  })
})
