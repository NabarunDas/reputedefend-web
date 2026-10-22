/**
 * A quote stored before the gross-price migration keeps its exclusive total.
 * After that migration it must not become a new offer, acceptance, or payment.
 * The stored row is not rewritten. This database is disposable.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, applyUpgrade, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "c0a55000-0000-4000-8000-0000000000a1"
const customerAuth = "c0a55000-0000-4000-8000-0000000000d1"
const customer = "c0a55000-0000-4000-8000-0000000000c1"
const business = "c0a55000-0000-4000-8000-000000000022"
const location = "c0a55000-0000-4000-8000-000000000023"
const relaunchCase = "c0a55000-0000-4000-8000-000000000024"
const reviewCase = "c0a55000-0000-4000-8000-000000000025"
const adminToken = "c".repeat(64)
const acceptedQuote = "c0a55000-0000-4000-8000-000000000041"
const acceptedVersion = "c0a55000-0000-4000-8000-000000000042"
const acceptedSnapshot = "c0a55000-0000-4000-8000-000000000043"
const acceptedAction = "c0a55000-0000-4000-8000-000000000044"
const acceptedAcceptance = "c0a55000-0000-4000-8000-000000000045"
const acceptedOrder = "c0a55000-0000-4000-8000-000000000046"

const services = [
  "GUIDED_RELAUNCH",
  "MANAGED_RELAUNCH",
  "GUIDED_REVIEW",
  "MANAGED_REVIEW",
  "RELAUNCH_GUARD",
] as const

type StoredQuote = {
  service: string
  quoteId: string
  versionId: string
  version: number
  subtotal: number
  tax: number
  total: number
}

type Json = { status?: string; reason?: string; id?: string; version?: number; quoteVersionId?: string; message?: string }

const drafts: StoredQuote[] = []
let acceptedBefore: { subtotal: number; tax: number; total: number; status: string; orderAmount: number }

const key = () => randomUUID()

async function rpc(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: Json }>(sql, args)).rows[0].value
}

async function priceId(serviceCode: string) {
  return (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code = $1 and status = 'APPROVED' order by effective_from desc limit 1",
    [serviceCode],
  )).rows[0].id
}

async function moneyRow(versionId: string) {
  return (await db.query<{
    status: string
    quoted_subtotal_minor: number
    tax_amount_minor: number
    total_amount_minor: number
    tax_behaviour: string
  }>(
    `select status, quoted_subtotal_minor, tax_amount_minor, total_amount_minor, tax_behaviour
     from public.quote_versions where id = $1`,
    [versionId],
  )).rows[0]
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db, { through: "20261021155147" })
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
      id, case_type, customer_id, business_id, location_id, issue_description, created_at, information_accurate_at, privacy_accepted_at, service_track
    ) values
      ('${relaunchCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${location}', 'Profile suspended', '2026-01-01', now(), now(), 'UNDECIDED'),
      ('${reviewCase}', 'REVIEW_PROTECTION', '${customer}', '${business}', '${location}', 'Review dispute', '2026-01-01', now(), now(), 'UNDECIDED');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${customer}', 'email', 'alex@example.com', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${business}', 'verified', now(), '${admin}', 'Companies House match discussed on a live call.');
  `)

  for (const service of services) {
    const payload: Record<string, unknown> = {
      customerId: customer,
      businessId: business,
      locationId: location,
      scope: "Prepare the agreed recovery pack for this location only.",
      exclusions: "Google decisions and later payment collection are excluded.",
      validUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      applyDiscount: false,
      priceVersionId: await priceId(service),
      serviceCode: service,
    }
    if (service === "GUIDED_RELAUNCH" || service === "MANAGED_RELAUNCH") payload.caseId = relaunchCase
    if (service === "GUIDED_REVIEW" || service === "MANAGED_REVIEW") payload.caseId = reviewCase
    const draft = await rpc("admin_quote_command_v1", [adminToken, key(), "create_draft", payload, null])
    expect(draft?.status, service).toBe("success")
    const taxed = await rpc("admin_quote_command_v1", [
      adminToken,
      key(),
      "set_draft_tax",
      { quoteId: draft!.id, taxBehaviour: "EXCLUSIVE", taxRateBps: 2000 },
      draft!.version,
    ])
    expect(taxed?.status, service).toBe("success")
    const row = await moneyRow(draft!.quoteVersionId!)
    expect(row.tax_behaviour).toBe("EXCLUSIVE")
    expect(row.total_amount_minor).toBeGreaterThan(row.quoted_subtotal_minor)
    drafts.push({
      service,
      quoteId: draft!.id!,
      versionId: draft!.quoteVersionId!,
      version: taxed!.version!,
      subtotal: row.quoted_subtotal_minor,
      tax: row.tax_amount_minor,
      total: row.total_amount_minor,
    })
  }

  const price = await priceId("GUIDED_RELAUNCH")
  await db.query(
    `insert into public.quote_discount_snapshots(
      id, location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, service_code,
      policy_id, discount_bps, qualification_result, reason_code, standard_amount_minor, discount_amount_minor,
      discounted_subtotal_minor, recorded_by, source
    ) values ($1,$2,'NONE','UNKNOWN','NONE','UNPROVEN','GUIDED_RELAUNCH','NONE',0,'NOT_QUALIFIED','SYNTHETIC',9900,0,9900,$3,'ADMIN_RECORDED')`,
    [acceptedSnapshot, location, admin],
  )
  await db.query(
    "insert into public.quotes(id, public_ref, customer_id, business_id, location_id, case_id, status, created_by) values ($1,'QT-26-HGACPT',$2,$3,$4,$5,'OFFERED',$6)",
    [acceptedQuote, customer, business, location, relaunchCase, admin],
  )
  await db.query(
    `insert into public.quote_versions(
      id, quote_id, version_number, status, customer_id, business_id, location_id, case_id, service_code, price_version_id,
      service_name, payment_model, scope_text, exclusions_text, success_definition, standard_amount_minor, discount_policy_id,
      discount_bps, discount_amount_minor, quoted_subtotal_minor, tax_behaviour, tax_rate_bps, tax_amount_minor, total_amount_minor,
      currency, discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by, offered_at, offered_by
    ) values (
      $1,$2,1,'OFFERED',$3,$4,$5,$6,'GUIDED_RELAUNCH',$7,'GUIDED_RELAUNCH','UPFRONT',
      'We prepare the service for this location.','Work outside this quotation is excluded.','The service terms define the fee.',
      9900,'NONE',0,0,9900,'EXCLUSIVE',2000,
      admin_private.money_tax_minor_v1(9900, 'EXCLUSIVE', 2000),
      admin_private.money_total_minor_v1(9900, 'EXCLUSIVE', admin_private.money_tax_minor_v1(9900, 'EXCLUSIVE', 2000)),
      'GBP',$8, now() + interval '30 days',
      'Payment follows the accepted service terms.','The paid-service agreement named on this quotation applies.',$9, now(), $9
    )`,
    [acceptedVersion, acceptedQuote, customer, business, location, relaunchCase, price, acceptedSnapshot, admin],
  )
  await db.query("update public.quotes set current_version_id = $1 where id = $2", [acceptedVersion, acceptedQuote])
  await db.query(
    `insert into public.customer_actions(
      id, customer_id, business_id, location_id, case_id, kind, quote_version_id, secret_hash, expected_email_snapshot, expires_at, created_by
    ) values ($1,$2,$3,$4,$5,'QUOTE_ACCEPTANCE',$6,$7,'alex@example.com', now() + interval '2 days', $8)`,
    [acceptedAction, customer, business, location, relaunchCase, acceptedVersion, "ab".repeat(32), admin],
  )
  const acceptedMoney = await moneyRow(acceptedVersion)
  await db.query(
    `insert into public.quote_acceptances(
      id, quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
      total_amount_minor, currency, tax_behaviour, tax_amount_minor
    ) values ($1,$2,$3,$4,$5,'alex@example.com',$6,'GBP','EXCLUSIVE',$7)`,
    [acceptedAcceptance, acceptedQuote, acceptedVersion, acceptedAction, customerAuth, acceptedMoney.total_amount_minor, acceptedMoney.tax_amount_minor],
  )
  await db.query(
    "update public.quote_versions set status = 'ACCEPTED' where id = $1",
    [acceptedVersion],
  )
  await db.query(
    "update public.quotes set status = 'ACCEPTED' where id = $1",
    [acceptedQuote],
  )
  await db.query(
    `insert into public.service_orders(
      id, public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
      service_code, amount_minor, currency, payment_model, tax_behaviour, tax_rate_bps, tax_amount_minor, state, accepted_at
    ) values ($1,'SO-26-HGACPT',$2,$3,$4,$5,$6,$7,$8,'GUIDED_RELAUNCH',$9,'GBP','UPFRONT','EXCLUSIVE',2000,$10,'ACCEPTED_AWAITING_PAYMENT', now())`,
    [acceptedOrder, acceptedQuote, acceptedVersion, acceptedAcceptance, customer, business, location, relaunchCase, acceptedMoney.total_amount_minor, acceptedMoney.tax_amount_minor],
  )
  const storedAcceptance = await moneyRow(acceptedVersion)
  acceptedBefore = {
    subtotal: storedAcceptance.quoted_subtotal_minor,
    tax: storedAcceptance.tax_amount_minor,
    total: storedAcceptance.total_amount_minor,
    status: storedAcceptance.status,
    orderAmount: acceptedMoney.total_amount_minor,
  }
  expect(acceptedBefore.total).toBeGreaterThan(acceptedBefore.subtotal)
  expect(acceptedBefore.status).toBe("ACCEPTED")

  const upgraded = await applyUpgrade(db, "20261021155147")
  expect(upgraded.applied.map(item => item.entry.version)).toEqual(["20261021214813", "20261022124813", "20261022172455", "20261022234500"])
}, 180000)

afterAll(async () => { await db.close() })

describe("historical exclusive quotes after the gross-price rule", () => {
  it("refuses a new offer or acceptance for every stored over-gross draft and leaves the row unchanged", async () => {
    expect(drafts.map(item => item.service)).toEqual([...services])
    for (const draft of drafts) {
      const offered = await rpc("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft.quoteId }, draft.version])
      expect(offered, draft.service).toMatchObject({
        status: "denied",
        reason: "exclusive_adds_tax",
        message: "The quoted total is the final customer price. Tax cannot be added on top.",
      })
      await expect(db.query(
        "update public.quote_versions set status = 'OFFERED' where id = $1",
        [draft.versionId],
      )).rejects.toThrow(/gross_price:exclusive_adds_tax/)
      await expect(db.query(
        "update public.quote_versions set status = 'ACCEPTED' where id = $1",
        [draft.versionId],
      )).rejects.toThrow(/gross_price:exclusive_adds_tax/)
      const row = await moneyRow(draft.versionId)
      expect(row).toMatchObject({
        status: "DRAFT",
        tax_behaviour: "EXCLUSIVE",
        quoted_subtotal_minor: draft.subtotal,
        tax_amount_minor: draft.tax,
        total_amount_minor: draft.total,
      })
    }

    const sample = drafts[0]
    const cancelled = await rpc("admin_quote_command_v1", [adminToken, key(), "cancel", { quoteId: sample.quoteId }, sample.version])
    expect(cancelled?.status).toBe("success")
    const cancelledRow = await moneyRow(sample.versionId)
    expect(cancelledRow.status).toBe("CANCELLED")
    expect(cancelledRow.total_amount_minor).toBe(sample.total)
    expect(cancelledRow.quoted_subtotal_minor).toBe(sample.subtotal)
  })

  it("keeps an already accepted exclusive contract unchanged and refuses a new payment", async () => {
    const beforeTouch = await moneyRow(acceptedVersion)
    expect(beforeTouch).toMatchObject({
      status: "ACCEPTED",
      tax_behaviour: "EXCLUSIVE",
      quoted_subtotal_minor: acceptedBefore.subtotal,
      tax_amount_minor: acceptedBefore.tax,
      total_amount_minor: acceptedBefore.total,
    })
    await db.query("update public.quote_versions set offered_at = offered_at where id = $1", [acceptedVersion])
    await expect(db.query(
      "update public.quote_versions set total_amount_minor = quoted_subtotal_minor where id = $1",
      [acceptedVersion],
    )).rejects.toThrow(/gross_price:exclusive_adds_tax|immutable/)
    const afterTouch = await moneyRow(acceptedVersion)
    expect(afterTouch.total_amount_minor).toBe(acceptedBefore.total)
    expect(afterTouch.tax_amount_minor).toBe(acceptedBefore.tax)
    expect(afterTouch.status).toBe("ACCEPTED")

    await expect(db.query(
      `insert into public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, status)
       values ($1,'CREATE_CHECKOUT_SESSION','UPFRONT',$2,$3,'PENDING')`,
      [key(), customer, acceptedOrder],
    )).rejects.toThrow(/gross_price:exclusive_adds_tax/)
    await expect(db.query(
      `insert into public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, status)
       values ($1,'CREATE_INVOICE','INVOICE',$2,$3,'PENDING')`,
      [key(), customer, acceptedOrder],
    )).rejects.toThrow(/gross_price:exclusive_adds_tax/)
    const order = await db.query<{ amount_minor: number; tax_behaviour: string }>(
      "select amount_minor, tax_behaviour from public.service_orders where id = $1",
      [acceptedOrder],
    )
    expect(order.rows[0]).toEqual({ amount_minor: acceptedBefore.orderAmount, tax_behaviour: "EXCLUSIVE" })
    expect(await db.query<{ n: number }>(
      "select count(*)::int as n from public.provider_operations where service_order_id = $1",
      [acceptedOrder],
    )).toMatchObject({ rows: [{ n: 0 }] })
    const stillAccepted = await moneyRow(acceptedVersion)
    expect(stillAccepted.total_amount_minor).toBe(acceptedBefore.total)
    expect(stillAccepted.status).toBe("ACCEPTED")
  })
})
