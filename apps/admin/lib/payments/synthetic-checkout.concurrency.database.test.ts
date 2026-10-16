/**
 * Two PostgreSQL sessions settling one guided PaymentIntent.
 * PGlite has one connection, so it cannot show the second transaction waiting.
 * This file starts a private cluster when the server binaries are present.
 * A runner without those binaries skips the file. That skip is not a pass of the race.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { execFile as execFileCb } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { migrationChain } from "../recovery/manifest"

const execFile = promisify(execFileCb)
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find(dir => existsSync(join(dir, "initdb")))
const port = "55462"
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const later = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

let dataDir = ""
let socketDir = ""

async function psql(sql: string): Promise<string> {
  const result = await execFile(join(pgBin!, "psql"), [
    "-h", socketDir, "-p", port, "-U", "postgres", "-d", "payenv05",
    "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql,
  ], { env: { ...process.env, PGOPTIONS: "-c statement_timeout=20000" } })
  return result.stdout
}

function jsonLines(stdout: string): Array<Record<string, unknown>> {
  return stdout.split("\n").map(line => line.trim()).filter(line => line.startsWith("{")).map(line => JSON.parse(line) as Record<string, unknown>)
}

async function call(sql: string): Promise<Record<string, unknown>> {
  const row = jsonLines(await psql(sql))[0]
  if (!row) throw new Error(`no json row: ${sql.slice(0, 160)}`)
  return row
}

function fn(name: string, args: string[]) {
  return `select public.${name}(${args.join(",")})`
}

function j(value: unknown) {
  return `$pay$${JSON.stringify(value)}$pay$::jsonb`
}

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

describe.skipIf(!pgBin)("synthetic Checkout settlement under two PostgreSQL sessions", () => {
  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "payenv05-pg-"))
    dataDir = join(root, "data")
    socketDir = join(root, "socket")
    await mkdir(socketDir)
    await execFile(join(pgBin!, "initdb"), ["-D", dataDir, "--username=postgres", "--auth=trust", "--no-sync", "--locale=C"])
    await execFile(join(pgBin!, "pg_ctl"), [
      "-D", dataDir, "-l", join(root, "server.log"), "-w", "start",
      "-o", `-p ${port} -k ${socketDir} -c listen_addresses=`,
    ])
    await execFile(join(pgBin!, "createdb"), ["-h", socketDir, "-p", port, "-U", "postgres", "payenv05"])
    await psql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);`)
    for (const entry of migrationChain) {
      await execFile(join(pgBin!, "psql"), [
        "-h", socketDir, "-p", port, "-U", "postgres", "-d", "payenv05", "-v", "ON_ERROR_STOP=1",
        "-f", new URL(`../../../../supabase/migrations/${entry.filename}`, import.meta.url).pathname,
      ])
    }
    await psql(`
      insert into auth.users(id, email, email_confirmed_at) values
        ('${admin}','admin@profilerelaunch.com',now()),
        ('${alexAuth}','alex@example.com',now());
      update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
      insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}','${admin}',now());
      insert into public.customers(id, full_name, email) values ('${alex}','Alex Example','alex@example.com');
      insert into public.businesses(id, display_name) values ('${business}','Harbour Bakery');
      insert into public.locations(id, business_id, country, location_name) values ('${location}','${business}','UK','High Street');
    `)
    await psql(syntheticPurchasingEstablishmentSql(business, admin))
  }, 180000)

  afterAll(async () => {
    if (dataDir) {
      await execFile(join(pgBin!, "pg_ctl"), ["-D", dataDir, "-m", "immediate", "-w", "stop"]).catch(() => undefined)
      await rm(join(dataDir, ".."), { recursive: true, force: true })
    }
  })

  it("lets one of two overlapping PaymentIntent applies record the only receipt", async () => {
    const approved = await call(fn("admin_confirm_paid_service_agreement_v1", [q(adminToken), q(SYNTHETIC_APPROVAL_REQUEST), q(SYNTHETIC_APPROVAL_EVIDENCE)]))
    expect(approved.status).toBe("confirmed")
    await psql(`
      insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
      values ('${alex}','email','alex@example.com','${admin}','Verified from a live call with the customer.');
      insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
      values ('${alex}','${business}','verified',now(),'${admin}','Companies House match discussed on a live call.');
    `)
    const caseId = randomUUID()
    await psql(`insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ('${caseId}','PR-26-RACE22','PROFILE_RECOVERY','${alex}','${business}','${location}','Profile suspended', now(), now(), 'GUIDED')`)
    const price = (await psql(`select id from public.price_versions where service_code = 'GUIDED_RELAUNCH' and seed_key is not null limit 1`)).trim()
    const draft = await call(fn("admin_quote_command_v1", [q(adminToken), q(randomUUID()), q("create_draft"), j({
      customerId: alex, businessId: business, caseId, locationId: location,
      scope: "Prepare the agreed recovery pack for this location only.",
      exclusions: "Google decisions and later payment collection are excluded.",
      validUntil: later, applyDiscount: false, priceVersionId: price, serviceCode: "GUIDED_RELAUNCH",
    }), "null"]))
    expect(draft.status).toBe("success")
    const taxed = await call(fn("admin_quote_command_v1", [q(adminToken), q(randomUUID()), q("set_draft_tax"), j({ quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }), String(draft.version)]))
    expect(taxed.status).toBe("success")
    const offered = await call(fn("admin_quote_command_v1", [q(adminToken), q(randomUUID()), q("offer"), j({ quoteId: draft.id }), String(Number(draft.version) + 1)]))
    expect(offered.status).toBe("success")
    const secretHash = hash(randomBytes(32).toString("hex"))
    const issued = await call(fn("admin_quote_command_v1", [q(adminToken), q(randomUUID()), q("create_quote_acceptance_action"), j({
      quoteId: draft.id, expiresAt: actionExpiry, secretHash,
    }), "null"]))
    expect(issued.status).toBe("success")
    const pending = hash(randomBytes(32).toString("hex"))
    const session = hash(randomBytes(32).toString("hex"))
    expect((await call(fn("customer_action_exchange_v1", [q(String(issued.id)), q(secretHash), q(pending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_begin_otp_v1", [q(pending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_confirm_otp_sent_v1", [q(pending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_finish_otp_v1", [q(pending), q(session), q(alexAuth), q("alex@example.com")]))).status).toBe("ok")
    const accepted = await call(fn("customer_action_command_v1", [q(session), q(randomUUID()), q("accept"), j(paidQuoteCommand({
      quoteVersionId: String(offered.quoteVersionId), serviceCode: "GUIDED_RELAUNCH",
    }))]))
    expect(accepted.status).toBe("success")
    let version = Number((await psql(`select workflow_version from public.cases where id = '${caseId}'`)).trim())
    for (const [operation, data] of [
      ["plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null }],
      ["transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
      ["transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
      ["transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" }],
    ] as const) {
      const moved = await call(fn("admin_case_command_v1", [q(adminToken), q(randomUUID()), q(caseId), String(version), q(operation), j({
        note: "Reviewed the caller’s request and confirmed the details.", ...data,
      })]))
      expect(moved.status).toBe("success")
      version += 1
    }
    const orderId = (await psql(`select id from public.service_orders where case_id = '${caseId}'`)).trim()
    const amount = Number((await psql(`select amount_minor from public.service_orders where id = '${orderId}'`)).trim())
    const obligationId = (await psql(`select id from public.payment_obligations where service_order_id = '${orderId}'`)).trim()
    const orderRef = (await psql(`select public_ref from public.service_orders where id = '${orderId}'`)).trim()
    const paymentSecret = hash(randomBytes(32).toString("hex"))
    const payment = await call(fn("admin_payment_command_v1", [q(adminToken), q(randomUUID()), q("issue_guided_payment_action"), j({
      serviceOrderId: orderId, expiresAt: actionExpiry, secretHash: paymentSecret,
    }), "1"]))
    expect(payment.status).toBe("success")
    const paymentPending = hash(randomBytes(32).toString("hex"))
    const paymentSession = hash(randomBytes(32).toString("hex"))
    expect((await call(fn("customer_action_exchange_v1", [q(String(payment.id)), q(paymentSecret), q(paymentPending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_begin_otp_v1", [q(paymentPending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_confirm_otp_sent_v1", [q(paymentPending)]))).status).toBe("ok")
    expect((await call(fn("customer_action_finish_otp_v1", [q(paymentPending), q(paymentSession), q(alexAuth), q("alex@example.com")]))).status).toBe("ok")
    const checkout = await call(fn("customer_payment_command_v1", [q(paymentSession), q(randomUUID()), q("start_checkout"), j({ idempotencyKey: randomUUID() })]))
    expect(checkout.status).toBe("success")
    expect((await call(fn("payment_ensure_customer_map_v1", [q(alex), q("cus_syncrace")]))).status).toBe("success")
    expect((await call(fn("payment_record_provider_refs_v1", [q(String(checkout.providerOperationId)), q("cs_syncrace"), q("checkout.session")]))).status).toBe("success")
    const payload = {
      paymentIntentStatus: "succeeded", amountMinor: amount, currency: "gbp", stripeCustomerId: "cus_syncrace",
      customerId: alex, serviceOrderId: orderId, obligationId, attemptId: checkout.attemptId,
      providerOperationId: checkout.providerOperationId, orderRef, livemode: false,
    }
    const apply = (eventId: string) => fn("payment_apply_provider_event_v1", [q(eventId), q("payment_intent.succeeded"), q("pi_syncrace"), j(payload)])
    const pair = await Promise.all([psql(apply("evt_racepaira")), psql(apply("evt_racepairb"))])
    const statuses = pair.flatMap(text => jsonLines(text))
    expect(statuses.map(row => row.status).sort()).toEqual(["success", "success"])
    expect(statuses.filter(row => row.duplicate === true)).toHaveLength(1)
    expect((await psql(`select count(*) from public.payment_receipts where obligation_id = '${obligationId}'`)).trim()).toBe("1")
    expect((await psql(`select count(*) from public.payment_ledger where obligation_id = '${obligationId}' and event = 'PROVIDER_PAYMENT_SUCCEEDED'`)).trim()).toBe("1")
    expect((await psql(`select count(*) from public.payment_ledger where obligation_id = '${obligationId}' and event = 'RECEIPT_RECORDED'`)).trim()).toBe("1")

    const hold = `begin; ${apply("evt_raceholda")}; select pg_sleep(1.5); commit;`
    const heldPromise = psql(hold)
    const deadline = Date.now() + 3000
    let sleeping = 0
    while (Date.now() < deadline) {
      sleeping = Number((await psql(`select count(*) from pg_stat_activity where pid <> pg_backend_pid() and state = 'active' and query ilike '%pg_sleep%'`)).trim())
      if (sleeping > 0) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(sleeping).toBeGreaterThan(0)
    const started = Date.now()
    const waited = jsonLines(await psql(apply("evt_raceholdb")))[0]
    expect(Date.now() - started).toBeGreaterThan(400)
    await heldPromise
    expect(waited).toMatchObject({ status: "success", duplicate: true })
    expect((await psql(`select count(*) from public.payment_receipts where obligation_id = '${obligationId}'`)).trim()).toBe("1")
    expect((await psql(`select state from public.payment_obligations where id = '${obligationId}'`)).trim()).toBe("PAID")
  }, 60000)
})
