import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementBody, paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"
import { applyChain, preparePlatform } from "../recovery/harness"
import { syntheticPurchasingEstablishmentSql } from "./purchasing-establishment.fixture"
import { SYNTHETIC_APPROVAL_EVIDENCE } from "./paid-service-approval.fixture"

const confirmation = `Solicitor reviewed paid-service agreement ${PAID_SERVICE_AGREEMENT_VERSION} with SHA-256 ${paidServiceAgreementContentHash}.`

const db = new PGlite()
const alex = "c13a0000-0000-4000-8000-0000000000a1"
const sam = "c13a0000-0000-4000-8000-0000000000b2"
const alexAuth = "c13a0000-0000-4000-8000-0000000000d4"
const samAuth = "c13a0000-0000-4000-8000-0000000000e5"
const verifier = "c13a0000-0000-4000-8000-0000000000a7"
const business = "c13a0000-0000-4000-8000-000000000022"
const location = "c13a0000-0000-4000-8000-000000000023"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const token = () => randomBytes(32).toString("hex")
const adminToken = "b".repeat(64)

type AcceptResult = {
  status: string
  acceptanceId?: string
  orderId?: string
  snapshot?: {
    agreementBody?: string
    quotationSnapshot?: {
      scope?: string
      exclusions?: string
      successDefinition?: string
      businessName?: string
      locationName?: string
      caseReference?: string | null
      agreementVersion?: string
      agreementHash?: string
    }
    paymentDistinction?: { refundBeforeSubstantiveWork: string; automaticCardCharge: boolean; invoicesAfterSuccess: boolean; recurringConsent: boolean; collectsUpfront: boolean }
  }
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

async function offer(options: {
  quoteRef: string
  caseRef?: string
  customer?: string
  email?: string
  serviceCode?: string
  paymentModel?: string
  tax?: string
  standard?: number
  track?: string
  withCase?: boolean
}) {
  const customer = options.customer ?? alex
  const serviceCode = options.serviceCode ?? "GUIDED_RELAUNCH"
  const standard = options.standard ?? 9900
  const taxBehaviour = options.tax ?? "NOT_APPLICABLE"
  const snapshot = randomUUID()
  const quoteId = randomUUID()
  const version = randomUUID()
  const caseId = options.withCase === false ? null : randomUUID()
  if (caseId) {
    await db.query(
      `insert into public.cases(
        id, public_ref, case_type, status, customer_id, business_id, location_id, issue_description,
        information_accurate_at, privacy_accepted_at, service_track, work_stage, submitted_at, intake_snapshot
      ) values ($1,$2,'PROFILE_RECOVERY','UNDER_REVIEW',$3,$4,$5,'Synthetic issue kept inside the database.', now(), now(), $6, 'SERVICE_SELECTION', now(), '{}'::jsonb)`,
      [caseId, options.caseRef ?? options.quoteRef, customer, business, location, options.track ?? "GUIDED"],
    )
  }
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN',$3,'NONE',0,'NOT_QUALIFIED','SYNTHETIC_PORTAL',$4,0,$4,$5,'ADMIN_RECORDED')`,
    [snapshot, location, serviceCode, standard, verifier],
  )
  await db.query(
    `insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by)
     values ($1,$2,$3,$4,$5,$6,'OFFERED',$7)`,
    [quoteId, options.quoteRef, customer, business, location, caseId, verifier],
  )
  await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_rate_bps, tax_amount_minor, total_amount_minor,
      currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    )
    select $1, $2, 1, 'OFFERED', $3, $4, $5, $6, $7, p.id, $8, $9,
      'We prepare the service for this location.', 'Work outside this quotation is excluded.',
      'The service terms define when a fee is earned.',
      $10, 'NONE', 0, 0, $10, $11, null, 0, $10, 'GBP', $12, now() + interval '30 days',
      'Payment follows the accepted service terms.', 'The paid-service agreement named on this quotation applies.', $13, now(), $13
    from public.price_versions p
    where p.service_code = $7 and p.status = 'APPROVED'
    order by p.effective_from limit 1`,
    [version, quoteId, customer, business, location, caseId, serviceCode, serviceCode, options.paymentModel ?? "UPFRONT", standard, taxBehaviour, snapshot, verifier],
  )
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [version, quoteId])
  const actionId = randomUUID()
  const secret = hash(randomUUID())
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash, expected_email_snapshot, expires_at, created_by
    ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,$8, now() + interval '2 days', $9)`,
    [actionId, customer, business, location, caseId, version, secret, options.email ?? "alex@example.com", verifier],
  )
  const session = hash(token())
  await db.query(
    "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) values ($1,$2,$3, now() + interval '1 day')",
    [session, actionId, customer === alex ? alexAuth : samAuth],
  )
  return { quoteId, version, caseId, actionId, session }
}

function payload(quoteVersionId: string, feeBasis: unknown = null, termsHash = paidServiceAgreementContentHash) {
  return {
    quoteVersionId,
    businessPurpose: { accepted: true },
    terms: { accepted: true, version: "PS-2026-10-14.2", hash: termsHash },
    feeBasis,
  }
}

let alexPortal = ""
let samPortal = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex@example.com', '${verifier}', 'Verified from a live call with the customer.'),
      ('${sam}', 'email', 'sam@example.com', '${verifier}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${business}', 'verified', now(), '${verifier}', 'Companies House match discussed on a live call.'),
      ('${sam}', '${business}', 'verified', now(), '${verifier}', 'Companies House match discussed on a live call.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, verifier))
  alexPortal = await portalSession("alex@example.com", alexAuth)
  samPortal = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

describe("paid-service acceptance foundation", () => {
  it("stores the frozen contract without marking it operative", async () => {
    const catalogue = await rows<{ status: string; operative: boolean; body_text: string; content_hash: string }>(
      "select status, operative, body_text, content_hash from public.paid_service_agreement_catalogue where version_id = 'PS-2026-10-14.2'",
    )
    expect(catalogue).toEqual([{
      status: "SOLICITOR_REVIEW",
      operative: false,
      body_text: paidServiceAgreementBody,
      content_hash: paidServiceAgreementContentHash,
    }])
    const offered = await offer({ quoteRef: "QT-26-CMAAAA", caseRef: "PR-26-CMAAAA" })
    const refused = await rpc<AcceptResult>("accept_paid_service_terms_v1", [offered.session, randomUUID(), payload(offered.version)])
    expect(refused.status).toBe("not_operative")
    expect(await count("select count(*)::int as n from public.paid_service_acceptances")).toBe(0)
    const hidden = await rpc<{ quote: { commercialAgreementBody: string | null; commercialAgreementReady: boolean; scope: string } | null }>(
      "customer_action_session_v1", [offered.session],
    )
    expect(hidden?.quote?.commercialAgreementReady).toBe(false)
    expect(hidden?.quote?.commercialAgreementBody).toBeNull()
    expect(hidden?.quote?.scope).toBe("We prepare the service for this location.")
    const portal = await rpc<{ found: boolean; quote: { commercialAgreementBody: string | null; commercialAgreementReady: boolean; canAccept: boolean } | null }>(
      "customer_portal_case_service_v1", [alexPortal, "PR-26-CMAAAA"],
    )
    expect(portal.found).toBe(true)
    expect(portal.quote?.commercialAgreementReady).toBe(false)
    expect(portal.quote?.commercialAgreementBody).toBeNull()
    expect(portal.quote?.canAccept).toBe(false)
    const other = await rpc<{ found: boolean }>("customer_portal_case_service_v1", [samPortal, "PR-26-CMAAAA"])
    expect(other.found).toBe(false)
    expect(JSON.stringify(other)).not.toContain("ProfileRelaunch Ltd — Paid-service agreement")
    expect(await count(
      "select count(*)::int as n from admin_private.paid_service_quote_disclosure_v1($1, $2)",
      [PAID_SERVICE_AGREEMENT_VERSION, "ab".repeat(32)],
    )).toBe(0)
    expect(await count(
      "select count(*)::int as n from admin_private.paid_service_quote_disclosure_v1($1, $2)",
      [PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash],
    )).toBe(0)
  })

  it("does not treat a caller-supplied actor and the predictable statement as approval", async () => {
    const spoofed = await rpc<{ status: string }>("confirm_paid_service_agreement_v1", [
      verifier, PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash, confirmation,
    ])
    expect(spoofed.status).toBe("unauthorised")
    const earlier = await rpc<{ status: string }>("confirm_paid_service_agreement_v1", [
      verifier, "PS-2026-10-14.1", paidServiceAgreementContentHash, confirmation,
    ])
    expect(earlier.status).toBe("unauthorised")
    const catalogue = await rows<{ status: string; operative: boolean }>(
      "select status, operative from public.paid_service_agreement_catalogue where version_id = 'PS-2026-10-14.2'",
    )
    expect(catalogue).toEqual([{ status: "SOLICITOR_REVIEW", operative: false }])
    expect(await count("select count(*)::int as n from public.paid_service_agreement_approvals")).toBe(0)
  })

  it("records privileged approval once from an authenticated operator and external evidence", async () => {
    await db.query(
      `insert into auth.users(id, email, email_confirmed_at) values ($1, 'admin@profilerelaunch.com', now())
       on conflict (id) do nothing`,
      [verifier],
    )
    await db.query("update public.admin_identity set auth_user_id = $1, enabled = true where singleton", [verifier])
    await db.query(
      "insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ($1, $2, now())",
      [adminToken, verifier],
    )
    const request = randomUUID()
    expect((await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [hash("missing"), request, SYNTHETIC_APPROVAL_EVIDENCE])).status).toBe("unauthorised")
    expect((await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, request, confirmation])).status).toBe("invalid")
    expect((await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, request, paidServiceAgreementContentHash])).status).toBe("invalid")
    expect((await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, request, PAID_SERVICE_AGREEMENT_VERSION])).status).toBe("invalid")
    const confirmed = await rpc<{ status: string; operative: boolean; hash: string }>("admin_confirm_paid_service_agreement_v1", [
      adminToken, request, SYNTHETIC_APPROVAL_EVIDENCE,
    ])
    expect(confirmed).toMatchObject({ status: "confirmed", operative: true, hash: paidServiceAgreementContentHash })
    const replay = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, request, SYNTHETIC_APPROVAL_EVIDENCE])
    expect(replay.status).toBe("replay")
    const conflict = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [
      adminToken, request, `${SYNTHETIC_APPROVAL_EVIDENCE} second file`,
    ])
    expect(conflict.status).toBe("conflict")
    const again = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [
      adminToken, randomUUID(), SYNTHETIC_APPROVAL_EVIDENCE,
    ])
    expect(again.status).toBe("already_confirmed")
    expect(await count("select count(*)::int as n from public.paid_service_agreement_approvals")).toBe(1)
    const approval = await rows<{ approved_by: string; evidence_reference: string; version_id: string; content_hash: string }>(
      "select approved_by, evidence_reference, version_id, content_hash from public.paid_service_agreement_approvals",
    )
    expect(approval).toEqual([{
      approved_by: verifier,
      evidence_reference: SYNTHETIC_APPROVAL_EVIDENCE,
      version_id: PAID_SERVICE_AGREEMENT_VERSION,
      content_hash: paidServiceAgreementContentHash,
    }])
    const body = await rows<{ body_text: string; operative: boolean }>("select body_text, operative from public.paid_service_agreement_catalogue where version_id = 'PS-2026-10-14.2'")
    expect(body[0].body_text).toBe(paidServiceAgreementBody)
    expect(body[0].operative).toBe(true)
    await expect(db.query(
      "update public.paid_service_agreement_approvals set evidence_reference = 'rewritten evidence reference text' where request_id = $1",
      [request],
    )).rejects.toThrow(/immutable/i)
  })

  it("refuses a bad session, a lapsed membership, another customer's quotation and a replaced quotation", async () => {
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [hash("missing"), randomUUID(), payload(randomUUID())])).status).toBe("unauthorised")
    const expired = await offer({ quoteRef: "QT-26-CMBAAA", caseRef: "PR-26-CMBAAA" })
    await db.query("update admin_private.customer_action_sessions set expires_at = now() - interval '1 minute' where token_hash = $1", [expired.session])
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [expired.session, randomUUID(), payload(expired.version)])).status).toBe("unauthorised")

    const pending = await offer({ quoteRef: "QT-26-CMCAAA", caseRef: "PR-26-CMCAAA" })
    await db.exec("alter table public.business_memberships disable trigger business_memberships_revoke_open_actions")
    await db.query(
      "update public.business_memberships set status = 'pending', verified_at = null, verified_by = null where customer_id = $1",
      [alex],
    )
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [pending.session, randomUUID(), payload(pending.version)])).status).toBe("membership_unverified")
    await db.query(
      "update public.business_memberships set status = 'verified', verified_at = now(), verified_by = $2 where customer_id = $1",
      [alex, verifier],
    )
    await db.exec("alter table public.business_memberships enable trigger business_memberships_revoke_open_actions")

    const own = await offer({ quoteRef: "QT-26-CMDAAA", caseRef: "PR-26-CMDAAA" })
    const theirs = await offer({ quoteRef: "QT-26-CMEAAA", caseRef: "PR-26-CMEAAA", customer: sam, email: "sam@example.com" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [own.session, randomUUID(), payload(theirs.version)])).status).toBe("cross_customer")

    const stale = await offer({ quoteRef: "QT-26-CMFAAA", caseRef: "PR-26-CMFAAA" })
    const replacement = randomUUID()
    await db.query(
      `insert into public.quote_versions(
        id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor,
        currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
      )
      select $1, quote_id, 2, 'OFFERED', customer_id, business_id, location_id, case_id, service_code, price_version_id,
        service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
        discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_amount_minor, total_amount_minor,
        currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, now(), created_by
      from public.quote_versions where id = $2`,
      [replacement, stale.version],
    )
    await db.query("update public.quote_versions set status = 'SUPERSEDED' where id = $1", [stale.version])
    await db.query("update public.quotes set current_version_id = $1 where id = $2", [replacement, stale.quoteId])
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [stale.session, randomUUID(), payload(stale.version)])).status).toBe("stale_quotation")
  })

  it("blocks unconfirmed tax, a missing acknowledgement, the legacy off-session consent and an irrelevant fee consent", async () => {
    const before = await count("select count(*)::int as n from public.quote_acceptances")
    const tax = await offer({ quoteRef: "QT-26-CMGAAA", caseRef: "PR-26-CMGAAA", tax: "UNCONFIRMED" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [tax.session, randomUUID(), payload(tax.version)])).status).toBe("tax_unconfirmed")
    const purpose = await offer({ quoteRef: "QT-26-CMHAAA", caseRef: "PR-26-CMHAAA" })
    const missingPurpose = payload(purpose.version)
    missingPurpose.businessPurpose = { accepted: false }
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [purpose.session, randomUUID(), missingPurpose])).status).toBe("missing_business_purpose")
    const terms = await offer({ quoteRef: "QT-26-CMJAAA", caseRef: "PR-26-CMJAAA" })
    const missingTerms = payload(terms.version)
    missingTerms.terms = { accepted: false, version: "PS-2026-10-14.2", hash: paidServiceAgreementContentHash }
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [terms.session, randomUUID(), missingTerms])).status).toBe("missing_terms")
    const staleTerms = await offer({ quoteRef: "QT-26-CMKAAA", caseRef: "PR-26-CMKAAA" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [staleTerms.session, randomUUID(), payload(staleTerms.version, null, "ab".repeat(32))])).status).toBe("stale_version")
    const guided = await offer({ quoteRef: "QT-26-CMLAAA", caseRef: "PR-26-CMLAAA" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, randomUUID(), payload(guided.version, { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" })])).status).toBe("irrelevant_consent")
    const managed = await offer({
      quoteRef: "QT-26-CMMAAA", caseRef: "PR-26-CMMAAA", serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", standard: 29900, track: "MANAGED",
    })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [managed.session, randomUUID(), payload(managed.version, { accepted: true, kind: "SUCCESS_FEE_CONSENT_V1" })])).status).toBe("legacy_off_session_consent")
    expect(await count("select count(*)::int as n from public.quote_acceptances")).toBe(before)
    expect(await count("select count(*)::int as n from public.paid_service_acceptances")).toBe(0)
  })

  it("accepts each fee basis once, keeps the snapshot, and does not rewrite older agreement rows", async () => {
    const agreementsBefore = await count("select count(*)::int as n from public.agreement_versions")
    const authorisationsBefore = await count("select count(*)::int as n from public.authorization_records")
    const guided = await offer({ quoteRef: "QT-26-CNAAAA", caseRef: "PR-26-CNAAAA" })
    const shown = await rpc<{ quote: { commercialAgreementBody: string | null; commercialAgreementReady: boolean; scope: string; successDefinition: string; totalAmountMinor: number; paymentTiming: string } }>(
      "customer_action_session_v1", [guided.session],
    )
    expect(shown.quote.commercialAgreementReady).toBe(true)
    expect(shown.quote.commercialAgreementBody).toBe(paidServiceAgreementBody)
    expect(shown.quote.scope).toBe("We prepare the service for this location.")
    expect(shown.quote.successDefinition).toContain("fee is earned")
    expect(shown.quote.totalAmountMinor).toBe(9900)
    expect(shown.quote.paymentTiming).toContain("accepted service terms")
    const portalQuote = await rpc<{ found: boolean; quote: { commercialAgreementBody: string | null; commercialAgreementReady: boolean; canAccept: boolean } }>(
      "customer_portal_case_service_v1", [alexPortal, "PR-26-CNAAAA"],
    )
    expect(portalQuote.found).toBe(true)
    expect(portalQuote.quote.commercialAgreementReady).toBe(true)
    expect(portalQuote.quote.commercialAgreementBody).toBe(paidServiceAgreementBody)
    expect(portalQuote.quote.canAccept).toBe(true)
    const otherCustomer = await rpc<{ found: boolean }>("customer_portal_case_service_v1", [samPortal, "PR-26-CNAAAA"])
    expect(otherCustomer.found).toBe(false)
    expect(JSON.stringify(otherCustomer)).not.toContain(paidServiceAgreementBody.slice(0, 40))
    const request = randomUUID()
    const accepted = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, request, payload(guided.version)])
    expect(accepted.status).toBe("success")
    expect(accepted.snapshot?.agreementBody).toBe(paidServiceAgreementBody)
    expect(accepted.snapshot?.quotationSnapshot).toMatchObject({
      scope: "We prepare the service for this location.",
      exclusions: "Work outside this quotation is excluded.",
      successDefinition: "The service terms define when a fee is earned.",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      caseReference: "PR-26-CNAAAA",
      agreementVersion: PAID_SERVICE_AGREEMENT_VERSION,
      agreementHash: paidServiceAgreementContentHash,
    })
    expect(accepted.snapshot?.paymentDistinction).toEqual({
      collectsUpfront: true, invoicesAfterSuccess: false, automaticCardCharge: false, recurringConsent: false, refundBeforeSubstantiveWork: "full",
    })
    const replay = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, request, payload(guided.version)])
    expect(replay.status).toBe("replay")
    expect(replay.acceptanceId).toBe(accepted.acceptanceId)
    const duplicate = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, randomUUID(), payload(guided.version)])
    expect(duplicate.status).toBe("already_accepted")
    expect(duplicate.acceptanceId).toBe(accepted.acceptanceId)
    expect(await count("select count(*)::int as n from public.paid_service_acceptances where quote_version_id = $1", [guided.version])).toBe(1)

    const managed = await offer({
      quoteRef: "QT-26-CNBAAA", caseRef: "PR-26-CNBAAA", serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", standard: 29900, track: "MANAGED",
    })
    const managedResult = await rpc<AcceptResult>("accept_paid_service_terms_v1", [
      managed.session, randomUUID(), payload(managed.version, { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" }),
    ])
    expect(managedResult.status).toBe("success")
    expect(managedResult.snapshot?.paymentDistinction).toMatchObject({
      collectsUpfront: false, invoicesAfterSuccess: true, automaticCardCharge: false, recurringConsent: false, refundBeforeSubstantiveWork: "not_applicable",
    })
    expect(managedResult.snapshot?.agreementBody).not.toContain("off-session")

    const guard = await offer({
      quoteRef: "QT-26-CNCAAA", serviceCode: "RELAUNCH_GUARD", paymentModel: "RECURRING_MONTHLY", standard: 999, withCase: false,
    })
    const wrongGuard = await rpc<AcceptResult>("accept_paid_service_terms_v1", [
      guard.session, randomUUID(), payload(guard.version, { accepted: true, kind: "GUARD_RECURRING_CONSENT_V1", locationId: location, amountMinor: 1000 }),
    ])
    expect(wrongGuard.status).toBe("stale_quotation")
    const guardResult = await rpc<AcceptResult>("accept_paid_service_terms_v1", [
      guard.session, randomUUID(), payload(guard.version, { accepted: true, kind: "GUARD_RECURRING_CONSENT_V1", locationId: location, amountMinor: 999 }),
    ])
    expect(guardResult.status).toBe("success")
    expect(guardResult.snapshot?.paymentDistinction).toMatchObject({ collectsUpfront: false, recurringConsent: true, automaticCardCharge: false })

    const downloaded = await rpc<AcceptResult["snapshot"] & { status: string }>("paid_service_acceptance_snapshot_v1", [alexPortal, accepted.acceptanceId])
    expect(downloaded?.status).toBe("ok")
    expect(downloaded?.agreementBody).toBe(paidServiceAgreementBody)
    const hidden = await rpc<{ status: string; agreementBody?: string }>("paid_service_acceptance_snapshot_v1", [samPortal, accepted.acceptanceId])
    expect(hidden.status).toBe("unauthorised")
    expect(hidden.agreementBody).toBeUndefined()
    expect(JSON.stringify(hidden)).not.toContain("ProfileRelaunch Ltd — Paid-service agreement")
    expect(JSON.stringify(hidden)).not.toContain("We prepare the service for this location.")

    await expect(db.query("update public.paid_service_acceptances set agreement_body = 'changed' where id = $1", [accepted.acceptanceId])).rejects.toThrow(/immutable/i)
    expect(await count("select count(*)::int as n from public.agreement_versions")).toBe(agreementsBefore)
    expect(await count("select count(*)::int as n from public.authorization_records")).toBe(authorisationsBefore)
    const changed = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, request, payload(guided.version, { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" })])
    expect(changed.status).toBe("conflict")
  })

  it("refuses one-checkbox, direct and cross-customer acceptance after the agreement is operative", async () => {
    const beforeOrders = await count("select count(*)::int as n from public.service_orders")
    const beforePaid = await count("select count(*)::int as n from public.paid_service_acceptances")
    const checkbox = await offer({ quoteRef: "QT-26-CNGAAA", caseRef: "PR-26-CNGAAA" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [checkbox.session, randomUUID(), { accepted: true }])).status).toBe("missing_business_purpose")
    expect((await rpc<AcceptResult>("customer_action_command_v1", [checkbox.session, randomUUID(), "accept", { accepted: true }])).status).toBe("invalid")
    const selector = (await rows<{ value: string }>("select admin_private.customer_portal_action_selector_v1($1) as value", [checkbox.actionId]))[0].value
    expect((await rpc<AcceptResult>("customer_portal_service_command_v1", [
      alexPortal, randomUUID(), "PR-26-CNGAAA", selector, "accept_quote", { accepted: true },
    ])).status).toBe("invalid")
    const direct = await rows<{ value: AcceptResult }>(
      "select admin_private.accept_quote_version_v1(a, $2, $3) as value from public.customer_actions a where a.id = $1",
      [checkbox.actionId, alexAuth, randomUUID()],
    )
    expect(direct[0].value.status).toBe("consent_required")
    const wrongCustomer = await offer({ quoteRef: "QT-26-CNHAAA", caseRef: "PR-26-CNHAAA", customer: sam, email: "sam@example.com" })
    expect((await rpc<AcceptResult>("accept_paid_service_terms_v1", [checkbox.session, randomUUID(), payload(wrongCustomer.version)])).status).toBe("cross_customer")
    expect((await rpc<AcceptResult>("customer_portal_service_command_v1", [
      samPortal, randomUUID(), "PR-26-CNGAAA", selector, "accept_quote", { accepted: true, ...payload(checkbox.version) },
    ])).status).toBe("not_found")
    expect(await count("select count(*)::int as n from public.service_orders")).toBe(beforeOrders)
    expect(await count("select count(*)::int as n from public.paid_service_acceptances")).toBe(beforePaid)
    expect(await rows<{ complete: boolean; record: boolean }>(
      `select
         has_function_privilege('service_role', 'admin_private.complete_quote_acceptance_v1(public.customer_actions, uuid, uuid)', 'execute') as complete,
         has_function_privilege('service_role', 'admin_private.record_paid_service_acceptance_v1(public.customer_actions, uuid, uuid, jsonb)', 'execute') as record`,
    )).toEqual([{ complete: false, record: false }])
  })

  it("keeps the bound quotation immutable and replays a historical order without a new obligation", async () => {
    const bound = await offer({ quoteRef: "QT-26-CNJAAA", caseRef: "PR-26-CNJAAA" })
    const binding = await rows<{ commercial_agreement_version: string; commercial_agreement_hash: string }>(
      "select commercial_agreement_version, commercial_agreement_hash from public.quote_versions where id = $1",
      [bound.version],
    )
    expect(binding[0]).toEqual({
      commercial_agreement_version: PAID_SERVICE_AGREEMENT_VERSION,
      commercial_agreement_hash: paidServiceAgreementContentHash,
    })
    await expect(db.query("update public.quote_versions set scope_text = 'A different scope after the quotation was offered.' where id = $1", [bound.version])).rejects.toThrow(/immutable/i)
    await expect(db.query("update public.quote_versions set commercial_agreement_hash = null, commercial_agreement_version = null where id = $1", [bound.version])).rejects.toThrow(/immutable/i)

    const historical = await offer({ quoteRef: "QT-26-CNKAAA", caseRef: "PR-26-CNKAAA" })
    const acceptance = randomUUID()
    const order = randomUUID()
    await db.query(
      `insert into public.quote_acceptances(
        id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
        total_amount_minor, currency, tax_behaviour, tax_amount_minor
      ) values ($1,$2,$3,$4,$5,'alex@example.com',9900,'GBP','NOT_APPLICABLE',0)`,
      [acceptance, historical.quoteId, historical.version, historical.actionId, alexAuth],
    )
    await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [historical.version])
    await db.query("update public.quotes set status = 'ACCEPTED' where id = $1", [historical.quoteId])
    await db.query(
      `insert into public.service_orders(
        id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
        service_code, amount_minor, currency, payment_model, tax_behaviour, tax_amount_minor, state, accepted_at
      ) values ($1,'SO-26-HSTAAA',$2,$3,$4,$5,$6,$7,$8,'GUIDED_RELAUNCH',9900,'GBP','UPFRONT','NOT_APPLICABLE',0,'ACCEPTED_AWAITING_PAYMENT', now())`,
      [order, historical.quoteId, historical.version, acceptance, alex, business, location, historical.caseId],
    )
    const replay = await rpc<AcceptResult>("customer_action_command_v1", [historical.session, randomUUID(), "accept", { accepted: true }])
    expect(replay.status).toBe("success")
    expect(replay.orderId).toBe(order)
    expect(await count("select count(*)::int as n from public.service_orders where quote_version_id = $1", [historical.version])).toBe(1)
    expect(await count("select count(*)::int as n from public.paid_service_acceptances where quote_version_id = $1", [historical.version])).toBe(0)
    const second = await rpc<AcceptResult>("accept_paid_service_terms_v1", [historical.session, randomUUID(), payload(historical.version)])
    expect(second.status).toBe("success")
    expect(await count("select count(*)::int as n from public.paid_service_acceptances where quote_version_id = $1", [historical.version])).toBe(0)
    expect(await count("select count(*)::int as n from public.service_orders where quote_version_id = $1", [historical.version])).toBe(1)
  })

  it("returns the same acceptance when the same quotation is submitted twice", async () => {
    const duplicate = await offer({ quoteRef: "QT-26-CNLAAA", caseRef: "PR-26-CNLAAA" })
    const firstKey = randomUUID()
    const secondKey = randomUUID()
    const first = await rpc<AcceptResult>("accept_paid_service_terms_v1", [duplicate.session, firstKey, payload(duplicate.version)])
    const second = await rpc<AcceptResult>("accept_paid_service_terms_v1", [duplicate.session, secondKey, payload(duplicate.version)])
    expect(first.status).toBe("success")
    expect(second.status).toBe("already_accepted")
    expect(second.acceptanceId).toBe(first.acceptanceId)
    expect(await count("select count(*)::int as n from public.service_orders where quote_version_id = $1", [duplicate.version])).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_obligations where service_order_id = $1", [first.orderId])).toBe(1)
  })
})
