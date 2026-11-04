import { execFile } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { readdirSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createServer } from "node:net"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { applyChain, preparePlatform, type MigrationExecutor } from "../recovery/harness"

function postgresBin() {
  const versions = readdirSync("/usr/lib/postgresql").sort()
  const version = versions.at(-1)
  if (!version) throw new Error("PostgreSQL is not installed, so two-connection settlement was not run.")
  return `/usr/lib/postgresql/${version}/bin`
}
const alex = "b033a000-0000-4000-8000-0000000000a1"
const alexAuth = "b033a000-0000-4000-8000-0000000000d4"
const actor = "b033a000-0000-4000-8000-0000000000aa"
const bakery = "b033a000-0000-4000-8000-000000000011"
const high = "b033a000-0000-4000-8000-000000000021"
const dock = "b033a000-0000-4000-8000-000000000022"
const stripeCustomer = "cus_NffrFeUfNV2Hib"
const periodStart = "2026-11-01T00:00:00.000Z"
const periodEnd = "2026-12-01T00:00:00.000Z"
const eventId = "evt_1P2abcDEF3ghiJKL"
const invoiceId = "in_1P2abcDEF3ghiJKL"
const priceId = "price_1P2abcDEF3ghiJKL"
const sessionId = "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2"

type Row = Record<string, unknown>

let directory = ""
let port = 0
let admin: Client
let seeded: Row

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, (error, _stdout, stderr) => {
      if (error) reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`))
      else resolve()
    })
  })
}

function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a local PostgreSQL port."))
        return
      }
      const reserved = address.port
      server.close(() => resolve(reserved))
    })
  })
}

function connect() {
  return new Client({ host: directory, port, user: "settlement", database: "settlement" })
}

function executor(client: Client): MigrationExecutor {
  return { exec: (sql) => client.query(sql) }
}

async function rpc(client: Client, name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  const result = await client.query<{ value: Row }>(sql, args)
  return result.rows[0].value
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function portalSession(client: Client) {
  const pending = hash(randomBytes(32).toString("hex"))
  const started = await rpc(client, "customer_portal_begin_login_v1", ["alex.concurrent@example.com", pending])
  if (started.status !== "ok") throw new Error(`login ${JSON.stringify(started)}`)
  const confirmed = await rpc(client, "customer_portal_confirm_otp_sent_v1", [pending])
  if (confirmed.status !== "ok") throw new Error(`otp ${JSON.stringify(confirmed)}`)
  const sessionHash = hash(randomBytes(32).toString("hex"))
  const finished = await rpc(client, "customer_portal_finish_otp_v1", [pending, sessionHash, alexAuth, "alex.concurrent@example.com"])
  if (finished.status !== "ok") throw new Error(`session ${JSON.stringify(finished)}`)
  return sessionHash
}

async function armCheckout(client: Client, session: string) {
  const ref = "VC-26-C2N2AB"
  const terms = "TELLOYA-SET-N2AB"
  const plan = randomUUID()
  const subscription = randomUUID()
  const request = randomUUID()
  await client.query(
    `insert into public.plan_versions(
      id, product_code, version_number, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    ) values ($1, 'TELLOYA', 80, 'DRAFT', now() - interval '30 days', 'MONTH', 'GBP', 7900, 'NOT_APPLICABLE', $2)`,
    [plan, terms],
  )
  await client.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope) values ($1, 'TELLOYA', 2, 'LOCATION')`,
    [plan],
  )
  await client.query(`update public.plan_versions set status = 'APPROVED', approved_by = $2, approved_at = now() where id = $1`, [plan, actor])
  const title = "Telloya service agreement"
  const body = "This agreement covers the named Telloya service for the selected locations only."
  const cancellation = "Cancel in writing before the next billing date."
  const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])
  await client.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status, approved_by, approved_at
    ) values (
      $1, 'TELLOYA', $2, $3, $4, $5,
      admin_private.commercial_agreement_hash_v1('TELLOYA', $2, $3, $4, $5, $6::jsonb),
      $6::jsonb, 'APPROVED', $7, now()
    )`,
    [randomUUID(), terms, title, body, cancellation, confirmations, actor],
  )
  await client.query(
    `insert into public.commercial_subscriptions(
      id, public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
      amount_minor, currency, tax_behaviour, cadence_snapshot, terms_ref
    ) values ($1, $2, $3, $4, 'VOICE', $5, 'BILLABLE', 'DRAFT', 7900, 'GBP', 'NOT_APPLICABLE', 'MONTH', $6)`,
    [subscription, ref, alex, bakery, plan, terms],
  )
  await client.query(
    `insert into public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
     values ($1, 'TELLOYA', 1, 2)`,
    [subscription],
  )
  await client.query(`update public.commercial_subscriptions set state = 'OFFERED' where id = $1`, [subscription])
  await client.query(
    `insert into public.onboarding_requests(
      id, customer_id, business_id, email_snapshot, product_code, plan_family, state, commercial_subscription_id
    ) values ($1, $2, $3, 'alex.concurrent@example.com', 'TELLOYA', 'VOICE', 'OFFERED', $4)`,
    [request, alex, bakery, subscription],
  )
  await client.query(
    `insert into admin_private.onboarding_request_locations(onboarding_request_id, location_id) values ($1, $2), ($1, $3)`,
    [request, high, dock],
  )
  await client.query(
    `insert into public.commercial_plan_conditions(
      id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
      base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
      status, approved_by, approved_at
    ) values (
      $1, $2, 'GROWTH', 'Growth', 300, false, 7900, null, 25,
      admin_private.commercial_plan_conditions_hash_v1('GROWTH', 300, false, 7900, null, 25),
      'APPROVED', $3, now()
    )`,
    [randomUUID(), plan, actor],
  )
  const version = await client.query<{ record_version: number }>(
    `select record_version from public.commercial_subscriptions where id = $1`,
    [subscription],
  )
  const consent = {
    offerVersion: version.rows[0].record_version,
    priceMinor: 7900,
    taxBehaviour: "NOT_APPLICABLE",
    taxMinor: null,
    cadence: "MONTH",
    agreementRef: terms,
    agreementAccepted: true,
    recurringConsent: true,
    confirmations: { business_authority: true },
    conditions: {
      tier: "Growth", includedMinutes: 300, minutesRollover: false, baseAmountMinor: 7900,
      guardIncluded: false, guardUnitMinor: null, guardQuantity: 0,
      overagePermitted: true, overageRateMinor: 25, overageOptIn: false, overageCapMinor: null,
    },
  }
  const accepted = await rpc(client, "customer_portal_commercial_offer_command_v1", [session, randomUUID(), ref, JSON.stringify(consent)])
  if (accepted.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
  const started = await rpc(client, "customer_portal_commercial_payment_prepare_v1", [session, randomUUID(), ref])
  if (started.status !== "success") throw new Error(`prepare ${JSON.stringify(started)}`)
  const priced = await rpc(client, "commercial_payment_record_price_v1", [started.priceOperationId, priceId, "prod_1P2abcDEF3"])
  if (priced.status !== "success") throw new Error(`price ${JSON.stringify(priced)}`)
  await client.query(
    `insert into public.stripe_customer_maps(customer_id, stripe_customer_id) values ($1, $2)`,
    [alex, stripeCustomer],
  )
  const recorded = await rpc(client, "commercial_payment_record_checkout_v1", [started.providerOperationId, sessionId])
  if (recorded.status !== "success") throw new Error(`checkout ${JSON.stringify(recorded)}`)
  await rpc(client, "payment_receive_stripe_event_v1", [eventId, "invoice.paid", invoiceId, false])
  return {
    customerId: alex,
    subscriptionId: subscription,
    acceptanceId: String(started.acceptanceId),
    operationId: String(started.providerOperationId),
  }
}

function settlementFacts(identity: { customerId: string; subscriptionId: string; acceptanceId: string; operationId: string }) {
  return {
    eventId,
    invoiceId,
    checkoutSessionId: sessionId,
    stripeCustomerId: stripeCustomer,
    stripeSubscriptionId: "sub_1P2abcDEF3ghiJKL",
    checkoutSubscriptionId: "sub_1P2abcDEF3ghiJKL",
    stripePriceId: priceId,
    currency: "gbp",
    invoiceStatus: "paid",
    amountDueMinor: 7900,
    amountPaidMinor: 7900,
    quantity: 1,
    lineCount: 1,
    discountMinor: 0,
    taxMinor: 0,
    periodStart,
    periodEnd,
    billingReason: "subscription_create",
    livemode: false,
    automaticTax: false,
    trial: false,
    refunded: false,
    disputed: false,
    subscriptionStatus: "active",
    cancelAtPeriodEnd: false,
    schedulePresent: false,
    subscriptionLivemode: false,
    subscriptionCustomerId: stripeCustomer,
    subscriptionPriceId: priceId,
    subscriptionQuantity: 1,
    subscriptionPeriodStart: periodStart,
    subscriptionPeriodEnd: periodEnd,
    checkoutMode: "subscription",
    checkoutStatus: "complete",
    checkoutPaymentStatus: "paid",
    checkoutLivemode: false,
    checkoutCustomerId: stripeCustomer,
    conflictingMetadata: false,
    commercialCustomerId: identity.customerId,
    commercialSubscriptionId: identity.subscriptionId,
    acceptanceId: identity.acceptanceId,
    checkoutOperationId: identity.operationId,
    checkoutMetadataCustomerId: identity.customerId,
    checkoutMetadataSubscriptionId: identity.subscriptionId,
    checkoutMetadataAcceptanceId: identity.acceptanceId,
    checkoutMetadataOperationId: identity.operationId,
    subscriptionMetadataCustomerId: identity.customerId,
    subscriptionMetadataSubscriptionId: identity.subscriptionId,
    subscriptionMetadataAcceptanceId: identity.acceptanceId,
    subscriptionMetadataOperationId: identity.operationId,
  }
}

beforeAll(async () => {
  directory = await mkdtemp(`${tmpdir()}/commercial-settlement-`)
  port = await reservePort()
  const bin = postgresBin()
  await run(`${bin}/initdb`, ["-D", directory, "-U", "settlement", "-A", "trust", "--locale=C", "--encoding=UTF8"])
  await run(`${bin}/pg_ctl`, [
    "-D", directory, "-l", `${directory}/server.log`, "-w",
    "-o", `-k ${directory} -p ${port} -c listen_addresses=127.0.0.1`,
    "start",
  ])
  await run(`${bin}/createdb`, ["-h", directory, "-p", String(port), "-U", "settlement", "settlement"])
  admin = connect()
  await admin.connect()
  await admin.query("set statement_timeout = '20s'")
  await preparePlatform(executor(admin))
  await admin.query("create role postgres superuser")
  await applyChain(executor(admin))
  await admin.query(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${alexAuth}', 'alex.concurrent@example.com', now()),
      ('${actor}', 'actor.concurrent@example.com', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Baker', 'alex.concurrent@example.com');
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${alex}', 'email', 'alex.concurrent@example.com', '${actor}', 'Verified from a live call with the customer.');
    insert into public.businesses(id, display_name) values ('${bakery}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${high}', '${bakery}', 'GB', 'High Street'),
      ('${dock}', '${bakery}', 'GB', 'Dock');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${alex}', '${bakery}', 'verified', now(), '${actor}', 'Mailbox already proved for Bakery');
  `)
  await admin.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  const session = await portalSession(admin)
  seeded = await armCheckout(admin, session)
}, 300000)

afterAll(async () => {
  await admin?.end().catch(() => undefined)
  if (directory) {
    await run(`${postgresBin()}/pg_ctl`, ["-D", directory, "-m", "immediate", "stop"]).catch(async (error: Error) => {
      const log = await readFile(`${directory}/server.log`, "utf8").catch(() => "")
      console.error(log)
      console.error(error.message)
    })
    await rm(directory, { recursive: true, force: true })
  }
})

describe("commercial settlement on two PostgreSQL connections", () => {
  it("lets one worker settle the same Stripe event and leaves the lease reusable only as already processed", async () => {
    const first = connect()
    const second = connect()
    await first.connect()
    await second.connect()
    await first.query("set statement_timeout = '8s'")
    await second.query("set statement_timeout = '8s'")
    try {
      await first.query("BEGIN")
      const held = await rpc(first, "commercial_payment_invoice_claim_v1", [eventId, priceId, stripeCustomer])
      expect(held.status).toBe("success")
      const overlapped = await rpc(second, "commercial_payment_invoice_claim_v1", [eventId, priceId, stripeCustomer])
      expect(overlapped).toMatchObject({ status: "conflict" })
      await first.query("ROLLBACK")
      const running = await admin.query<{ count: number }>(
        `select count(*)::int as count from admin_private.jobs where status = 'RUNNING'`,
      )
      expect(running.rows[0].count).toBe(0)

      const [left, right] = await Promise.all([
        rpc(first, "commercial_payment_invoice_claim_v1", [eventId, priceId, stripeCustomer]),
        rpc(second, "commercial_payment_invoice_claim_v1", [eventId, priceId, stripeCustomer]),
      ])
      const claims = [left, right]
      const won = claims.filter(claim => claim.status === "success")
      const lost = claims.filter(claim => claim.status === "conflict")
      expect(won).toHaveLength(1)
      expect(lost).toHaveLength(1)
      const lease = won[0]

      const body = JSON.stringify(settlementFacts({
        customerId: String(seeded.customerId),
        subscriptionId: String(seeded.subscriptionId),
        acceptanceId: String(seeded.acceptanceId),
        operationId: String(seeded.operationId),
      }))
      const [settledLeft, settledRight] = await Promise.all([
        rpc(first, "commercial_payment_settle_initial_invoice_v1", [lease.jobId, lease.leaseToken, body]),
        rpc(second, "commercial_payment_settle_initial_invoice_v1", [lease.jobId, lease.leaseToken, body]),
      ])
      expect([settledLeft.status, settledRight.status].sort()).toEqual(["already_processed", "settled"])

      const evidence = await admin.query<{ count: number }>(`select count(*)::int as count from public.commercial_payment_evidence`)
      const active = await admin.query<{ count: number }>(
        `select count(*)::int as count from public.commercial_subscription_events where to_state = 'ACTIVE'`,
      )
      const subscription = await admin.query<{ state: string }>(
        `select state from public.commercial_subscriptions where id = $1`,
        [seeded.subscriptionId],
      )
      const job = await admin.query<{ status: string; lease_token: string | null }>(
        `select status, lease_token from admin_private.jobs where id = $1`,
        [lease.jobId],
      )
      expect(evidence.rows[0].count).toBe(1)
      expect(active.rows[0].count).toBe(1)
      expect(subscription.rows[0].state).toBe("ACTIVE")
      expect(job.rows[0]).toEqual({ status: "SUCCEEDED", lease_token: null })

      const again = await rpc(first, "commercial_payment_invoice_claim_v1", [eventId, priceId, stripeCustomer])
      expect(again).toMatchObject({ status: "denied", reason: "already_processed" })
      const replay = await rpc(second, "commercial_payment_settle_initial_invoice_v1", [lease.jobId, randomUUID(), body])
      expect(replay).toMatchObject({ status: "already_processed" })
      const evidenceAfter = await admin.query<{ count: number }>(`select count(*)::int as count from public.commercial_payment_evidence`)
      expect(evidenceAfter.rows[0].count).toBe(1)
    } finally {
      await first.end()
      await second.end()
    }
  }, 60000)
})
