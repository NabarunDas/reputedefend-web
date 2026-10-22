/**
 * CUSTOMER-QUOTE-04 on a disposable database.
 * The activation file is applied only inside this test. It is not applied
 * to DEV or Production. No live quotation is cancelled, and no mail or
 * payment is sent.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import {
  PAID_SERVICE_AGREEMENT_VERSION,
  paidServiceAgreementBody,
  paidServiceAgreementContentHash,
} from "../../../../lib/commercial/paid-service-agreement"
import { proposedServiceAgreements } from "../../../../lib/commercial/service-agreements"

const ownerApprovalStatement = (version: string, hash: string) =>
  `Business owner approved the wording of paid-service agreement ${version} with SHA-256 ${hash} on 22 October 2026. This is not external solicitor confirmation.`
const solicitorConfirmationStatement = (version = PAID_SERVICE_AGREEMENT_VERSION, hash = paidServiceAgreementContentHash) =>
  `Solicitor reviewed paid-service agreement ${version} with SHA-256 ${hash}.`
import { applyChain, preparePlatform } from "../recovery/harness"
import { syntheticPurchasingEstablishmentSql } from "./purchasing-establishment.fixture"
import { SYNTHETIC_APPROVAL_EVIDENCE } from "./paid-service-approval.fixture"

const db = new PGlite()
const admin = "c2710000-0000-4000-8000-0000000000a1"
const customer = "c2710000-0000-4000-8000-0000000000c1"
const customerAuth = "c2710000-0000-4000-8000-0000000000d1"
const business = "c2710000-0000-4000-8000-000000000022"
const location = "c2710000-0000-4000-8000-000000000023"
const freshCase = "c2710000-0000-4000-8000-000000000024"
const adminToken = "d".repeat(64)
const ownerEvidence = "Business owner approved this exact wording in the project conversation on 22 October 2026."

type Json = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  quoteVersionId?: string
  publicRef?: string
  approvalBasis?: string
  hash?: string
  operative?: boolean
}

type AgreementRow = {
  commercial_agreement_version: string | null
  commercial_agreement_hash: string | null
  status: string
  total_amount_minor: number
  quoted_subtotal_minor: number
  tax_amount_minor: number
  tax_behaviour: string
  currency: string
}

type CatalogueRow = {
  version_id: string
  content_hash: string
  body_text: string
  status: string
  operative: boolean
  service_code: string | null
  approval_basis: string | null
  solicitor_confirmed_at: string | null
  solicitor_statement: string | null
  owner_approved_at: string | null
  owner_approval_statement: string | null
}

const key = () => randomUUID()
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex")
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const guided = proposedServiceAgreements.find(item => item.serviceCode === "GUIDED_RELAUNCH")!
const managed = proposedServiceAgreements.find(item => item.serviceCode === "MANAGED_RELAUNCH")!

let historicalQuoteId = ""
let historicalVersionId = ""
let historicalRef = ""
let secondQuoteId = ""

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

async function agreementOf(versionId: string) {
  return (await db.query<AgreementRow>(
    `select commercial_agreement_version, commercial_agreement_hash, status, total_amount_minor,
            quoted_subtotal_minor, tax_amount_minor, tax_behaviour, currency
     from public.quote_versions where id = $1`,
    [versionId],
  )).rows[0]
}

async function catalogue(versionId: string) {
  return (await db.query<CatalogueRow>(
    `select version_id, content_hash, body_text, status, operative, service_code, approval_basis,
            solicitor_confirmed_at, solicitor_statement, owner_approved_at, owner_approval_statement
     from public.paid_service_agreement_catalogue where version_id = $1`,
    [versionId],
  )).rows[0]
}

async function disclosure(version: string, hash: string) {
  return db.query<{ ready: boolean; body: string }>(
    "select ready, body from admin_private.paid_service_quote_disclosure_v1($1, $2)",
    [version, hash],
  )
}

async function createCase(caseType: "PROFILE_RECOVERY" | "REVIEW_PROTECTION") {
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

async function createDraft(serviceCode: string, caseId: string | null) {
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
  }
  if (caseId) payload.caseId = caseId
  return rpc("admin_quote_command_v1", [adminToken, key(), "create_draft", payload, null])
}

async function setTax(quoteId: string, version: number) {
  return rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", {
    quoteId, taxBehaviour: "NOT_APPLICABLE",
  }, version])
}

async function offer(quoteId: string, version: number) {
  return rpc("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId }, version])
}

async function offerService(serviceCode: string, caseId?: string | null) {
  const resolved = caseId === undefined
    ? serviceCode === "RELAUNCH_GUARD"
      ? null
      : await createCase(serviceCode.endsWith("REVIEW") ? "REVIEW_PROTECTION" : "PROFILE_RECOVERY")
    : caseId
  const draft = await createDraft(serviceCode, resolved)
  expect(draft?.status, JSON.stringify(draft)).toBe("success")
  const taxed = await setTax(draft!.id!, draft!.version!)
  expect(taxed?.status, JSON.stringify(taxed)).toBe("success")
  const offered = await offer(draft!.id!, taxed!.version!)
  expect(offered?.status, JSON.stringify(offered)).toBe("success")
  return { draft: draft!, taxed: taxed!, offered: offered!, caseId: resolved, row: await agreementOf(offered!.quoteVersionId!) }
}

async function approve(version: string, evidence = ownerEvidence, request = key()) {
  return rpc("admin_record_owner_paid_service_agreement_approval_v1", [adminToken, request, version, evidence])
}

async function acceptanceLink(versionId: string, caseId: string | null) {
  const actionId = randomUUID()
  const session = sha256(randomBytes(32).toString("hex"))
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash,
      expected_email_snapshot, expires_at, created_by
    ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8)`,
    [actionId, customer, business, location, caseId, versionId, sha256(randomUUID()), admin],
  )
  await db.query(
    "insert into admin_private.customer_action_sessions(token_hash, action_id, auth_user_id, expires_at) values ($1,$2,$3, now() + interval '1 day')",
    [session, actionId, customerAuth],
  )
  return session
}

function terms(versionId: string, version: string, hash: string, feeBasis: unknown = null) {
  return {
    quoteVersionId: versionId,
    businessPurpose: { accepted: true },
    terms: { accepted: true, version, hash },
    feeBasis,
  }
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
    insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, created_at,
      information_accurate_at, privacy_accepted_at, service_track
    ) values (
      '${freshCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${location}',
      'Synthetic Guided Relaunch kept inside this database.', '2026-01-01', now(), now(), 'UNDECIDED'
    );
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${customer}', 'email', 'alex@example.com', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${business}', 'verified', now(), '${admin}', 'Companies House match discussed on a live call.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin, "GB"))
}, 180000)

afterAll(async () => { await db.close() })

describe("service-specific agreement activation", () => {
  it("inserts the five approved bodies as unapproved rows and leaves the omnibus untouched", async () => {
    const rows = await db.query<CatalogueRow>(
      `select version_id, content_hash, body_text, status, operative, service_code, approval_basis,
              solicitor_confirmed_at, solicitor_statement, owner_approved_at, owner_approval_statement
       from public.paid_service_agreement_catalogue order by version_id`,
    )
    expect(rows.rows).toHaveLength(6)
    const omnibus = rows.rows.find(row => row.version_id === PAID_SERVICE_AGREEMENT_VERSION)!
    expect(omnibus).toMatchObject({
      content_hash: paidServiceAgreementContentHash,
      body_text: paidServiceAgreementBody,
      status: "SOLICITOR_REVIEW",
      operative: false,
      service_code: null,
      approval_basis: null,
      solicitor_confirmed_at: null,
      solicitor_statement: null,
      owner_approved_at: null,
      owner_approval_statement: null,
    })
    expect(sha256(omnibus.body_text)).toBe(paidServiceAgreementContentHash)
    for (const proposed of proposedServiceAgreements) {
      const row = rows.rows.find(item => item.version_id === proposed.version)!
      expect(row.content_hash).toBe(proposed.contentHash)
      expect(row.body_text).toBe(proposed.body)
      expect(sha256(row.body_text)).toBe(proposed.contentHash)
      expect(row).toMatchObject({
        status: "SOLICITOR_REVIEW",
        operative: false,
        service_code: proposed.serviceCode,
        approval_basis: null,
        solicitor_confirmed_at: null,
        solicitor_statement: null,
        owner_approved_at: null,
        owner_approval_statement: null,
      })
      expect((await disclosure(proposed.version, proposed.contentHash)).rows).toHaveLength(0)
    }
    expect((await disclosure(PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash)).rows).toHaveLength(0)
    await expect(db.query(
      "update public.paid_service_agreement_catalogue set body_text = body_text || ' ' where version_id = $1",
      [guided.version],
    )).rejects.toThrow(/immutable/i)
  })

  it("binds the omnibus before owner approval and still allows a second offer for the same case", async () => {
    const first = await offerService("GUIDED_RELAUNCH", freshCase)
    historicalQuoteId = first.offered.id!
    historicalVersionId = first.offered.quoteVersionId!
    historicalRef = first.draft.publicRef!
    expect(first.row).toMatchObject({
      commercial_agreement_version: PAID_SERVICE_AGREEMENT_VERSION,
      commercial_agreement_hash: paidServiceAgreementContentHash,
      status: "OFFERED",
      total_amount_minor: 9900,
      quoted_subtotal_minor: 9900,
      tax_amount_minor: 0,
      tax_behaviour: "NOT_APPLICABLE",
      currency: "GBP",
    })
    expect(first.row.commercial_agreement_version).not.toBe(guided.version)

    const second = await offerService("GUIDED_RELAUNCH", freshCase)
    secondQuoteId = second.offered.id!
    expect(second.row.commercial_agreement_version).toBe(PAID_SERVICE_AGREEMENT_VERSION)
    expect(second.row.commercial_agreement_hash).toBe(paidServiceAgreementContentHash)
    const cancelled = await rpc("admin_quote_command_v1", [adminToken, key(), "cancel", { quoteId: secondQuoteId }, second.offered.version])
    expect(cancelled?.status).toBe("success")
    expect(await count(
      "select count(*)::int as n from public.quotes where case_id = $1 and status = 'OFFERED'",
      [freshCase],
    )).toBe(1)
  })

  it("refuses owner approval without a session, with predictable text, or for the omnibus", async () => {
    expect(await rpc("admin_record_owner_paid_service_agreement_approval_v1", [
      "e".repeat(64), key(), guided.version, ownerEvidence,
    ])).toMatchObject({ status: "unauthorised" })
    expect(await approve(guided.version, guided.version)).toMatchObject({ status: "invalid" })
    expect(await approve(guided.version, guided.contentHash)).toMatchObject({ status: "invalid" })
    expect(await approve(guided.version, ownerApprovalStatement(guided.version, guided.contentHash))).toMatchObject({ status: "invalid" })
    expect(await approve(guided.version, solicitorConfirmationStatement(guided.version, guided.contentHash))).toMatchObject({ status: "invalid" })
    expect(await approve(guided.version, "A note that says solicitor reviewed this wording.")).toMatchObject({ status: "invalid" })
    expect(await approve(PAID_SERVICE_AGREEMENT_VERSION)).toMatchObject({ status: "unknown_version" })
    expect((await catalogue(guided.version)).operative).toBe(false)
    expect((await catalogue(guided.version)).solicitor_statement).toBeNull()
  })

  it("records business-owner approval for Guided Relaunch and does not invent solicitor confirmation", async () => {
    const request = key()
    const confirmed = await approve(guided.version, ownerEvidence, request)
    expect(confirmed).toMatchObject({
      status: "confirmed",
      version: guided.version,
      hash: guided.contentHash,
      operative: true,
      approvalBasis: "BUSINESS_OWNER",
    })
    const row = await catalogue(guided.version)
    expect(row).toMatchObject({
      status: "APPROVED",
      operative: true,
      approval_basis: "BUSINESS_OWNER",
      solicitor_confirmed_at: null,
      solicitor_statement: null,
      owner_approval_statement: ownerApprovalStatement(guided.version, guided.contentHash),
    })
    expect(row.owner_approved_at).toBeTruthy()
    expect(row.body_text).toBe(guided.body)
    const approval = await db.query<{ approval_basis: string; statement: string; evidence_reference: string }>(
      "select approval_basis, statement, evidence_reference from public.paid_service_agreement_approvals where request_id = $1",
      [request],
    )
    expect(approval.rows[0]).toEqual({
      approval_basis: "BUSINESS_OWNER",
      statement: ownerApprovalStatement(guided.version, guided.contentHash),
      evidence_reference: ownerEvidence,
    })
    const event = await db.query<{ event: string; details: { approvalBasis: string; solicitorConfirmation: boolean } }>(
      "select event, details from public.paid_service_agreement_events where version_id = $1",
      [guided.version],
    )
    expect(event.rows).toEqual([{
      event: "OWNER_APPROVED",
      details: expect.objectContaining({ approvalBasis: "BUSINESS_OWNER", solicitorConfirmation: false }),
    }])
    expect(await approve(guided.version, ownerEvidence, request)).toMatchObject({ status: "replay", approvalBasis: "BUSINESS_OWNER" })
    expect(await approve(guided.version, `${ownerEvidence} A second file.`, request)).toMatchObject({ status: "conflict" })
    expect(await approve(guided.version)).toMatchObject({ status: "already_confirmed", approvalBasis: "BUSINESS_OWNER" })
    await expect(db.query(
      "update public.paid_service_agreement_catalogue set owner_approval_statement = 'rewritten' where version_id = $1",
      [guided.version],
    )).rejects.toThrow(/immutable/i)
    const shown = await disclosure(guided.version, guided.contentHash)
    expect(shown.rows).toHaveLength(1)
    expect(shown.rows[0].body).toBe(guided.body)
    expect((await disclosure(managed.version, managed.contentHash)).rows).toHaveLength(0)
    expect((await catalogue(managed.version)).solicitor_statement).toBeNull()
  })

  it("does not rewrite the quotation that was offered before that approval", async () => {
    expect(await agreementOf(historicalVersionId)).toMatchObject({
      commercial_agreement_version: PAID_SERVICE_AGREEMENT_VERSION,
      commercial_agreement_hash: paidServiceAgreementContentHash,
      status: "OFFERED",
      total_amount_minor: 9900,
      tax_behaviour: "NOT_APPLICABLE",
      currency: "GBP",
    })
  })

  it("binds Guided Relaunch on a new Guided offer and still binds the omnibus for Managed", async () => {
    const nextGuided = await offerService("GUIDED_RELAUNCH")
    expect(nextGuided.row).toMatchObject({
      commercial_agreement_version: guided.version,
      commercial_agreement_hash: guided.contentHash,
      total_amount_minor: 9900,
    })
    const nextManaged = await offerService("MANAGED_RELAUNCH")
    expect(nextManaged.row.commercial_agreement_version).toBe(PAID_SERVICE_AGREEMENT_VERSION)
    expect(nextManaged.row.commercial_agreement_hash).toBe(paidServiceAgreementContentHash)
    expect(nextManaged.row.commercial_agreement_hash).not.toBe(guided.contentHash)
    expect(nextManaged.row.commercial_agreement_hash).not.toBe(managed.contentHash)
    expect(nextManaged.row.total_amount_minor).toBe(29900)
  })

  it("accepts a Guided quotation against its own hash and refuses another service's hash", async () => {
    const offered = await offerService("GUIDED_RELAUNCH")
    const session = await acceptanceLink(offered.offered.quoteVersionId!, offered.caseId)
    const omnibusTerms = await rpc("accept_paid_service_terms_v1", [
      session, key(), terms(offered.offered.quoteVersionId!, PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash),
    ])
    expect(omnibusTerms.status).toBe("stale_version")
    const managedTerms = await rpc("accept_paid_service_terms_v1", [
      session, key(), terms(offered.offered.quoteVersionId!, managed.version, managed.contentHash),
    ])
    expect(managedTerms.status).toBe("stale_version")
    const accepted = await rpc("accept_paid_service_terms_v1", [
      session, key(), terms(offered.offered.quoteVersionId!, guided.version, guided.contentHash),
    ])
    expect(accepted.status).toBe("success")
    const stored = await db.query<{ agreement_version: string; agreement_hash: string; agreement_body: string }>(
      "select agreement_version, agreement_hash, agreement_body from public.paid_service_acceptances where quote_version_id = $1",
      [offered.offered.quoteVersionId],
    )
    expect(stored.rows[0]).toEqual({
      agreement_version: guided.version,
      agreement_hash: guided.contentHash,
      agreement_body: guided.body,
    })

    const omnibusOffer = await offerService("MANAGED_RELAUNCH")
    const omnibusSession = await acceptanceLink(omnibusOffer.offered.quoteVersionId!, omnibusOffer.caseId)
    expect((await rpc("accept_paid_service_terms_v1", [
      omnibusSession,
      key(),
      terms(omnibusOffer.offered.quoteVersionId!, PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash, {
        accepted: true, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1",
      }),
    ])).status).toBe("not_operative")
  })

  it("routes each remaining service to its own operative agreement", async () => {
    for (const proposed of proposedServiceAgreements.filter(item => item.serviceCode !== "GUIDED_RELAUNCH")) {
      expect((await approve(proposed.version)).status).toBe("confirmed")
      const row = await catalogue(proposed.version)
      expect(row.solicitor_statement).toBeNull()
      expect(row.solicitor_confirmed_at).toBeNull()
      expect(row.approval_basis).toBe("BUSINESS_OWNER")
      expect(row.owner_approval_statement).toBe(ownerApprovalStatement(proposed.version, proposed.contentHash))
    }
    for (const proposed of proposedServiceAgreements) {
      const offered = await offerService(proposed.serviceCode)
      expect(offered.row.commercial_agreement_version).toBe(proposed.version)
      expect(offered.row.commercial_agreement_hash).toBe(proposed.contentHash)
      const others = proposedServiceAgreements.filter(item => item.serviceCode !== proposed.serviceCode)
      for (const other of others) {
        expect(offered.row.commercial_agreement_hash).not.toBe(other.contentHash)
      }
      expect(offered.row.commercial_agreement_hash).not.toBe(paidServiceAgreementContentHash)
      const shown = await disclosure(proposed.version, proposed.contentHash)
      expect(shown.rows[0].body).toBe(proposed.body)
    }
  })

  it("replaces the local £99 Guided offer only after cancelling it, without mail or payment", async () => {
    const payments = await count("select count(*)::int as n from public.payment_attempts")
    const stripe = await count("select count(*)::int as n from public.stripe_customer_maps")
    const mail = await count("select count(*)::int as n from admin_private.communication_delivery_events")
    const communications = await count("select count(*)::int as n from public.communications")
    const actions = await count("select count(*)::int as n from public.customer_actions")
    const before = await agreementOf(historicalVersionId)
    expect(before).toMatchObject({
      commercial_agreement_version: PAID_SERVICE_AGREEMENT_VERSION,
      commercial_agreement_hash: paidServiceAgreementContentHash,
      total_amount_minor: 9900,
      status: "OFFERED",
    })

    const replacement = await createDraft("GUIDED_RELAUNCH", freshCase)
    expect(replacement?.status).toBe("success")
    expect(replacement?.publicRef).not.toBe(historicalRef)
    const taxed = await setTax(replacement!.id!, replacement!.version!)
    expect(taxed?.status).toBe("success")
    await expect(offer(replacement!.id!, taxed!.version!)).rejects.toThrow(/offered_quote:case_already_offered/)
    expect(await agreementOf(historicalVersionId)).toMatchObject({
      status: "OFFERED",
      commercial_agreement_hash: paidServiceAgreementContentHash,
      total_amount_minor: 9900,
    })

    const historicalVersion = (await db.query<{ record_version: number }>(
      "select record_version from public.quotes where id = $1",
      [historicalQuoteId],
    )).rows[0].record_version
    const cancelled = await rpc("admin_quote_command_v1", [
      adminToken, key(), "cancel", { quoteId: historicalQuoteId }, historicalVersion,
    ])
    expect(cancelled?.status).toBe("success")
    const offered = await offer(replacement!.id!, taxed!.version!)
    expect(offered?.status).toBe("success")
    expect(await agreementOf(offered!.quoteVersionId!)).toMatchObject({
      commercial_agreement_version: guided.version,
      commercial_agreement_hash: guided.contentHash,
      status: "OFFERED",
      total_amount_minor: 9900,
      quoted_subtotal_minor: 9900,
      tax_amount_minor: 0,
      tax_behaviour: "NOT_APPLICABLE",
      currency: "GBP",
    })
    expect(await agreementOf(historicalVersionId)).toMatchObject({
      commercial_agreement_version: PAID_SERVICE_AGREEMENT_VERSION,
      commercial_agreement_hash: paidServiceAgreementContentHash,
      status: "CANCELLED",
      total_amount_minor: 9900,
      quoted_subtotal_minor: 9900,
      tax_amount_minor: 0,
      currency: "GBP",
    })
    expect(await count(
      "select count(*)::int as n from public.quotes where case_id = $1 and status = 'OFFERED'",
      [freshCase],
    )).toBe(1)
    expect(await count("select count(*)::int as n from public.customer_actions where quote_version_id = $1", [offered!.quoteVersionId])).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_attempts")).toBe(payments)
    expect(await count("select count(*)::int as n from public.stripe_customer_maps")).toBe(stripe)
    expect(await count("select count(*)::int as n from admin_private.communication_delivery_events")).toBe(mail)
    expect(await count("select count(*)::int as n from public.communications")).toBe(communications)
    expect(await count("select count(*)::int as n from public.customer_actions")).toBe(actions)
  })

  it("still confirms the omnibus only through the solicitor function", async () => {
    const before = await catalogue(PAID_SERVICE_AGREEMENT_VERSION)
    expect(before.operative).toBe(false)
    expect(before.solicitor_statement).toBeNull()
    const confirmed = await rpc("admin_confirm_paid_service_agreement_v1", [adminToken, key(), SYNTHETIC_APPROVAL_EVIDENCE])
    expect(confirmed.status).toBe("confirmed")
    const omnibus = await catalogue(PAID_SERVICE_AGREEMENT_VERSION)
    expect(omnibus).toMatchObject({
      status: "APPROVED",
      operative: true,
      approval_basis: null,
      owner_approved_at: null,
      owner_approval_statement: null,
      solicitor_statement: solicitorConfirmationStatement(),
    })
    expect(omnibus.solicitor_confirmed_at).toBeTruthy()
    const guidedRow = await catalogue(guided.version)
    expect(guidedRow.solicitor_statement).toBeNull()
    expect(guidedRow.solicitor_confirmed_at).toBeNull()
    expect(guidedRow.approval_basis).toBe("BUSINESS_OWNER")
    expect((await disclosure(PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash)).rows[0].body).toBe(paidServiceAgreementBody)
  })
})
