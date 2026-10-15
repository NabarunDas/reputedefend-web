import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementBody, paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"
import { applyChain, preparePlatform } from "../recovery/harness"

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

type AcceptResult = {
  status: string
  acceptanceId?: string
  snapshot?: { agreementBody?: string; paymentDistinction?: { refundBeforeSubstantiveWork: string; automaticCardCharge: boolean; invoicesAfterSuccess: boolean; recurringConsent: boolean; collectsUpfront: boolean } }
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
  alexPortal = await portalSession("alex@example.com", alexAuth)
  samPortal = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

describe("paid-service acceptance foundation", () => {
  it("stores the frozen contract without marking it operative", async () => {
    const catalogue = await rows<{ status: string; operative: boolean; body_text: string; content_hash: string }>(
      "select status, operative, body_text, content_hash from public.paid_service_agreement_catalogue",
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
  })

  it("confirms only this version and hash, and does so once", async () => {
    const earlier = await rpc<{ status: string }>("confirm_paid_service_agreement_v1", [
      verifier, "PS-2026-10-14.1", paidServiceAgreementContentHash, confirmation.replace("PS-2026-10-14.2", "PS-2026-10-14.1"),
    ])
    expect(earlier.status).toBe("unknown_version")
    const wrongHash = "b".repeat(64)
    const mismatched = await rpc<{ status: string }>("confirm_paid_service_agreement_v1", [
      verifier, "PS-2026-10-14.2", wrongHash, confirmation.replace(paidServiceAgreementContentHash, wrongHash),
    ])
    expect(mismatched.status).toBe("confirmation_mismatch")
    const confirmed = await rpc<{ status: string; operative: boolean; hash: string }>("confirm_paid_service_agreement_v1", [
      verifier, "PS-2026-10-14.2", paidServiceAgreementContentHash, confirmation,
    ])
    expect(confirmed).toMatchObject({ status: "confirmed", operative: true, hash: paidServiceAgreementContentHash })
    const again = await rpc<{ status: string }>("confirm_paid_service_agreement_v1", [
      verifier, "PS-2026-10-14.2", paidServiceAgreementContentHash, confirmation,
    ])
    expect(again.status).toBe("already_confirmed")
    const body = await rows<{ body_text: string }>("select body_text from public.paid_service_agreement_catalogue")
    expect(body[0].body_text).toBe(paidServiceAgreementBody)
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
    const request = randomUUID()
    const accepted = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, request, payload(guided.version)])
    expect(accepted.status).toBe("success")
    expect(accepted.snapshot?.agreementBody).toBe(paidServiceAgreementBody)
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

    await expect(db.query("update public.paid_service_acceptances set agreement_body = 'changed' where id = $1", [accepted.acceptanceId])).rejects.toThrow(/immutable/i)
    expect(await count("select count(*)::int as n from public.agreement_versions")).toBe(agreementsBefore)
    expect(await count("select count(*)::int as n from public.authorization_records")).toBe(authorisationsBefore)
    const changed = await rpc<AcceptResult>("accept_paid_service_terms_v1", [guided.session, request, payload(guided.version, { accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" })])
    expect(changed.status).toBe("conflict")
  })
})
