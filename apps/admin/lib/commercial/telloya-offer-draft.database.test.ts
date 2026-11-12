/**
 * Disposable PGlite coverage for Telloya offer-draft calculator persistence.
 * Applies the source-only draft migration in-process only. No hosted apply,
 * Stripe, email, or Retell contact.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"
import { findMigration, pendingMigrations } from "../recovery/manifest"
import { installTelloyaCatalogueFixture, telloyaCataloguePlans } from "./telloya-catalogue.fixture"

const db = new PGlite()
const admin = "c01c0000-0000-4000-8000-00000000ac01"
const token = "cd".repeat(32)
const prepareReason = "Prepare Telloya offer after confirmed sales context."

async function rpc<T>(name: string, args: unknown[]) {
  const params = args.map((_, index) => `$${index + 1}`).join(",")
  return (await db.query<{ value: T }>(`select public.${name}(${params}) as value`, args)).rows[0].value
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows
}

const commercial = (operation: string, payload: object, version: number, key = randomUUID()) =>
  rpc<Record<string, unknown>>("admin_commercial_command_v1", [token, key, operation, payload, version])

beforeAll(async () => {
  expect(pendingMigrations().map(entry => entry.filename)).toEqual(["20261112210000_telloya_offer_draft_v1.sql"])
  expect(findMigration("20261112210000_telloya_offer_draft_v1.sql")).toMatchObject({
    appliedToDev: false,
    containsDataChange: false,
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

async function telloyaEnquiry(email: string) {
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
    planTier: "growth",
    locations: "London workshop",
    guardInterested: true,
    guardLocationCount: 2,
  }
  const enquiryId = (await db.query<{ id: string }>(
    `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
     values (gen_random_uuid(), md5($1::text), 'telloya', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
    [JSON.stringify(payload)],
  )).rows[0].id
  await db.query(
    `insert into admin_private.telloya_admin_demos(enquiry_id, status, completed_at, timezone, note, record_version)
     values ($1, 'COMPLETED', now(), 'Europe/London', 'Finished offline.', 2)`,
    [enquiryId],
  )
  const bootstrap = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
    token, randomUUID(), "bootstrap", { enquiryId },
  ])
  expect(bootstrap.status).toBe("success")
  return enquiryId
}

describe("Telloya offer draft persistence", () => {
  it("saves, reloads, updates and rejects a stale version", async () => {
    const enquiryId = await telloyaEnquiry("draft.save@example.test")
    const empty = await rpc<Record<string, unknown>>("telloya_offer_draft_v1", [token, enquiryId])
    expect(empty).toMatchObject({ status: "ready", locked: false, version: 0, draft: null })

    const firstKey = randomUUID()
    const first = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, firstKey, "save", {
        enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 2,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Growth with two proposed Guard locations.",
      },
    ])
    expect(first.status).toBe("success")
    expect(first.version).toBe(1)
    expect(first.draft).toMatchObject({
      planTier: "growth",
      proposedGuardQuantity: 2,
      overageOptIn: false,
      notes: "Growth with two proposed Guard locations.",
      version: 1,
    })

    const replay = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, firstKey, "save", {
        enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 2,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Growth with two proposed Guard locations.",
      },
    ])
    expect(replay).toEqual(first)

    const loaded = await rpc<Record<string, unknown>>("telloya_offer_draft_v1", [token, enquiryId])
    expect(loaded).toMatchObject({
      status: "ready",
      locked: false,
      version: 1,
      draft: {
        planTier: "growth",
        proposedGuardQuantity: 2,
        version: 1,
      },
    })

    const stale = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 0,
        planTier: "pro",
        proposedGuardQuantity: 1,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])
    expect(stale).toMatchObject({ status: "conflict", reason: "stale_version" })

    const update = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 1,
        planTier: "basic",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: true,
        overageCapPence: 2500,
        notes: "Switch to Basic.",
      },
    ])
    expect(update).toMatchObject({
      status: "success",
      version: 2,
      draft: {
        planTier: "basic",
        proposedGuardQuantity: 0,
        overageOptIn: true,
        overageCapPence: 2500,
        version: 2,
      },
    })

    const stored = await rows<{ plan_tier: string; proposed_guard_quantity: number; record_version: number }>(
      `select plan_tier, proposed_guard_quantity, record_version
       from admin_private.telloya_offer_drafts where enquiry_id = $1`,
      [enquiryId],
    )
    expect(stored).toEqual([{ plan_tier: "basic", proposed_guard_quantity: 0, record_version: 2 }])
    const events = await rows<{ from_version: number; to_version: number; before_state: { planTier: string | null } | null; after_state: { planTier: string } }>(
      `select from_version, to_version, before_state, after_state
       from admin_private.telloya_offer_draft_events where enquiry_id = $1 order by id`,
      [enquiryId],
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ from_version: 0, to_version: 1, before_state: null })
    expect(events[0].after_state).toMatchObject({ planTier: "growth", version: 1 })
    expect(events[1]).toMatchObject({ from_version: 1, to_version: 2 })
    expect(events[1].before_state).toMatchObject({ planTier: "growth", version: 1 })
    expect(events[1].after_state).toMatchObject({ planTier: "basic", overageOptIn: true, overageCapPence: 2500, version: 2 })
    expect(await rows(`select 1 from public.commercial_subscriptions`)).toEqual([])
  })

  it("rejects payload source spoofing, closed requests, and cross-business Guard ids", async () => {
    const spoofed = (await db.query<{ id: string }>(
      `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
       values (gen_random_uuid(), md5('spoof'), 'contact', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
      [JSON.stringify({ source: "telloya", email: "spoof@example.test", fullName: "Spoof" })],
    )).rows[0].id
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_v1", [token, spoofed])).toMatchObject({ status: "denied" })
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: spoofed,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])).toMatchObject({ status: "denied", reason: "not_telloya" })

    const enquiryId = await telloyaEnquiry("draft.closed@example.test")
    await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Before close.",
      },
    ])
    await db.query(
      `update public.onboarding_requests set state = 'CLOSED' where enquiry_id = $1 and product_code = 'TELLOYA'`,
      [enquiryId],
    )
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_v1", [token, enquiryId])).toMatchObject({
      status: "ready",
      locked: true,
    })
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 1,
        planTier: "pro",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])).toMatchObject({ status: "denied", reason: "onboarding_closed" })

    const guardEnquiry = await telloyaEnquiry("draft.guard@example.test")
    const business = (await rows<{ business_id: string }>(
      `select business_id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [guardEnquiry],
    ))[0]
    const ownLocation = (await db.query<{ id: string }>(
      `insert into public.locations(business_id, location_name, country)
       values ($1, 'Own depot', 'United Kingdom') returning id`,
      [business.business_id],
    )).rows[0].id
    const otherBusiness = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name) values ('Other Yard') returning id`,
    )).rows[0].id
    const foreignLocation = (await db.query<{ id: string }>(
      `insert into public.locations(business_id, location_name, country)
       values ($1, 'Foreign depot', 'United Kingdom') returning id`,
      [otherBusiness],
    )).rows[0].id
    expect(await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: guardEnquiry,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 1,
        guardLocationIds: [ownLocation, foreignLocation],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])).toMatchObject({ status: "denied", reason: "guard_location_mismatch" })
    const ownGuard = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId: guardEnquiry,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 1,
        guardLocationIds: [ownLocation],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Own Guard location only.",
      },
    ])
    expect(ownGuard).toMatchObject({ status: "success", draft: { proposedGuardQuantity: 1 } })
    expect((ownGuard.draft as { guardLocationIds: string[] }).guardLocationIds).toEqual([ownLocation])
  })

  it("locks draft edits once prepare_offer creates the official offer, and cascades with the enquiry", async () => {
    const email = "draft.lock@example.test"
    const enquiryId = await telloyaEnquiry(email)
    const saved = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 0,
        planTier: "growth",
        proposedGuardQuantity: 1,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "Draft before official offer.",
      },
    ])
    expect(saved).toMatchObject({ status: "success", version: 1 })

    let current = (await rows<{ record_version: number; customer_id: string; business_id: string }>(
      `select record_version, customer_id, business_id from public.onboarding_requests
       where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    await db.query(
      `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
       values ($1, 'email', $2, $3, $4)`,
      [current.customer_id, email, admin, prepareReason],
    )
    const membershipVersion = (await rows<{ record_version: number }>(
      `select record_version from public.business_memberships where customer_id = $1 and business_id = $2`,
      [current.customer_id, current.business_id],
    ))[0].record_version
    const verified = await rpc<Record<string, unknown>>("admin_membership_save_v1", [
      token, current.customer_id, current.business_id, membershipVersion, "verified", prepareReason, randomUUID(),
    ])
    expect(verified.status).toBe("success")
    const located = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "create_location", {
        enquiryId,
        locationName: "Owner Yard floor",
        country: "United Kingdom",
      },
    ])
    expect(located.status).toBe("success")
    current = (await rows<{ record_version: number; customer_id: string; business_id: string }>(
      `select record_version, customer_id, business_id from public.onboarding_requests
       where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    const prepared = await commercial("prepare_offer", {
      enquiryId,
      planVersionId: telloyaCataloguePlans.growthCap1,
      guardLocationIds: [],
      reason: prepareReason,
    }, current.record_version)
    expect(prepared.status).toBe("success")

    const locked = await rpc<Record<string, unknown>>("telloya_offer_draft_v1", [token, enquiryId])
    expect(locked).toMatchObject({ status: "ready", locked: true, version: 1 })
    const denied = await rpc<Record<string, unknown>>("telloya_offer_draft_command_v1", [
      token, randomUUID(), "save", {
        enquiryId,
        expectedVersion: 1,
        planTier: "pro",
        proposedGuardQuantity: 0,
        guardLocationIds: [],
        overageOptIn: false,
        overageCapPence: null,
        notes: "",
      },
    ])
    expect(denied).toMatchObject({ status: "denied", reason: "offer_locked" })
    expect((await rows<{ id: string }>("select id from public.communications where channel = 'EMAIL' and lifecycle = 'QUEUED'")).length).toBe(0)
  })

  it("declares enquiry cascade deletes for draft and audit retention", () => {
    const source = readFileSync(new URL("../../../../supabase/migrations/20261112210000_telloya_offer_draft_v1.sql", import.meta.url), "utf8")
    expect(source).toContain("onboarding_request_id uuid PRIMARY KEY REFERENCES public.onboarding_requests(id) ON DELETE CASCADE")
    expect(source).toContain("enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE")
    expect(source).toContain("onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests(id) ON DELETE CASCADE")
    expect(source).toContain("CREATE TABLE admin_private.telloya_offer_draft_events")
    expect(source).toContain("REVOKE ALL ON TABLE admin_private.telloya_offer_drafts FROM PUBLIC, anon, authenticated, service_role")
    expect(source).toContain("REVOKE ALL ON TABLE admin_private.telloya_offer_draft_events FROM PUBLIC, anon, authenticated, service_role")
    expect(source).toContain("enquiry.source IS DISTINCT FROM 'telloya'")
    expect(source).toContain("state NOT IN ('CLOSED', 'DECLINED')")
  })
})
