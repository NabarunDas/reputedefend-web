/**
 * Disposable PGlite coverage for Telloya sales-context bootstrap.
 * No hosted migration, Stripe call, email, or Retell contact.
 */
import { randomUUID } from "node:crypto"
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
  expect(pendingMigrations().map(entry => entry.filename)).toEqual(["20261112180000_telloya_sales_context_v1.sql"])
  expect(findMigration("20261112180000_telloya_sales_context_v1.sql")).toMatchObject({
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

async function telloyaEnquiry(email: string, businessName: string, locations = "London workshop", websiteUrl = "") {
  const payload = {
    fullName: "Alex Owner",
    email,
    phone: "07123456789",
    businessName,
    websiteUrl,
    country: "United Kingdom",
    service: "telloya",
    subject: "Telloya receptionist",
    details: "Please set up Telloya.",
    source: "telloya",
    planTier: "growth",
    locations,
    guardInterested: true,
    guardLocationCount: 1,
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
  return enquiryId
}

async function requestVersion(enquiryId: string) {
  return (await rows<{ record_version: number; business_id: string | null; customer_id: string | null }>(
    `select record_version, business_id, customer_id from public.onboarding_requests
     where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
    [enquiryId],
  ))[0]
}

describe("Telloya sales-context composite", () => {
  it("creates provisional customer and business, and does not auto-select an unrelated sole location", async () => {
    const enquiryId = await telloyaEnquiry("sales.context.create@example.test", "Owner Yard")
    const first = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(first.status).toBe("success")
    expect(first.exception).toBe("confirm_operating_location")
    const request = (await rows<{ customer_id: string; business_id: string; product_code: string }>(
      `select customer_id, business_id, product_code from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    expect(request.product_code).toBe("TELLOYA")
    expect(request.customer_id).toBeTruthy()
    expect(request.business_id).toBeTruthy()
    await db.query(
      `insert into public.locations(business_id, location_name, country) values ($1, 'Unrelated sole site', 'United Kingdom')`,
      [request.business_id],
    )
    const again = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(again.status).toBe("success")
    expect(again.exception).toBe("confirm_operating_location")
    const locations = await rows<{ location_id: string }>(
      `select location_id from admin_private.onboarding_request_locations
       where onboarding_request_id = (select id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED'))`,
      [enquiryId],
    )
    expect(locations).toEqual([])

    const replayKey = randomUUID()
    const firstReplay = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, replayKey, "bootstrap", { enquiryId },
    ])
    const secondReplay = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, replayKey, "bootstrap", { enquiryId },
    ])
    expect(secondReplay).toEqual(firstReplay)
    const customers = await rows<{ id: string }>(`select id from public.customers where lower(email) = lower($1)`, ["sales.context.create@example.test"])
    expect(customers).toHaveLength(1)
  })

  it("links a uniquely evidenced business name and location name", async () => {
    const email = "sales.context.evidence@example.test"
    const enquiryId = await telloyaEnquiry(email, "Matched Yard", "Matched Yard workshop")
    const customerId = (await db.query<{ id: string }>(
      `insert into public.customers(full_name, email) values ('Alex Owner', $1) returning id`,
      [email],
    )).rows[0].id
    const businessId = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name, website_url) values ('Matched Yard', '') returning id`,
    )).rows[0].id
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, evidence)
       values ($1, $2, 'pending', 'Pending membership for sales-context evidence match.')`,
      [customerId, businessId],
    )
    const locationId = (await db.query<{ id: string }>(
      `insert into public.locations(business_id, location_name, country) values ($1, 'Matched Yard workshop', 'United Kingdom') returning id`,
      [businessId],
    )).rows[0].id
    const result = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(result.status).toBe("success")
    expect(result.exception).toBeUndefined()
    const request = (await rows<{ business_id: string; customer_id: string }>(
      `select business_id, customer_id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    expect(request.customer_id).toBe(customerId)
    expect(request.business_id).toBe(businessId)
    const selected = await rows<{ location_id: string }>(
      `select location_id from admin_private.onboarding_request_locations
       where onboarding_request_id = (select id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED'))`,
      [enquiryId],
    )
    expect(selected).toEqual([{ location_id: locationId }])
  })

  it("does not auto-link a sole unrelated business and requires Admin confirmation", async () => {
    const email = "sales.context.mismatch@example.test"
    const enquiryId = await telloyaEnquiry(email, "Requested Shop")
    const customerId = (await db.query<{ id: string }>(
      `insert into public.customers(full_name, email) values ('Alex Owner', $1) returning id`,
      [email],
    )).rows[0].id
    const otherBusiness = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name, website_url) values ('Completely Different Ltd', '') returning id`,
    )).rows[0].id
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, evidence)
       values ($1, $2, 'pending', 'Pending membership for unrelated sole-business confirmation.')`,
      [customerId, otherBusiness],
    )
    const result = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(result.status).toBe("success")
    expect(result.exception).toBe("confirm_business_authority")
    const request = (await rows<{ customer_id: string | null; business_id: string | null }>(
      `select customer_id, business_id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    expect(request.customer_id).toBe(customerId)
    expect(request.business_id).toBeNull()

    const confirmed = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "confirm_business", { enquiryId, businessId: otherBusiness },
    ])
    expect(confirmed.status).toBe("success")
    const linked = (await rows<{ business_id: string }>(
      `select business_id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    expect(linked.business_id).toBe(otherBusiness)
  })

  it("refuses revoked membership and foreign-business ownership shortcuts", async () => {
    const email = "sales.context.revoked@example.test"
    const enquiryId = await telloyaEnquiry(email, "Revoked Yard")
    const customerId = (await db.query<{ id: string }>(
      `insert into public.customers(full_name, email) values ('Alex Owner', $1) returning id`,
      [email],
    )).rows[0].id
    const revokedBusiness = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name) values ('Revoked Yard') returning id`,
    )).rows[0].id
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, evidence)
       values ($1, $2, 'revoked', 'Authority withdrawn for this rehearsal.')`,
      [customerId, revokedBusiness],
    )
    const foreignBusiness = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name) values ('Someone Else') returning id`,
    )).rows[0].id
    const bootstrap = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(bootstrap.status).toBe("success")
    expect(bootstrap.exception).toBe("confirm_operating_location")
    const created = await requestVersion(enquiryId)
    expect(created.business_id).toBeTruthy()
    expect(created.business_id).not.toBe(revokedBusiness)

    const foreignConfirm = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "confirm_business", { enquiryId, businessId: foreignBusiness },
    ])
    expect(foreignConfirm.status).toBe("denied")

    const revokedEnquiry = await telloyaEnquiry("sales.context.revoked2@example.test", "Revoked Yard Two")
    const revokedCustomer = (await db.query<{ id: string }>(
      `insert into public.customers(full_name, email) values ('Alex Owner', $1) returning id`,
      ["sales.context.revoked2@example.test"],
    )).rows[0].id
    const onlyRevoked = (await db.query<{ id: string }>(
      `insert into public.businesses(display_name) values ('Revoked Yard Two') returning id`,
    )).rows[0].id
    await db.query(
      `insert into public.business_memberships(customer_id, business_id, status, evidence)
       values ($1, $2, 'revoked', 'Authority withdrawn for this rehearsal.')`,
      [revokedCustomer, onlyRevoked],
    )
    await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId: revokedEnquiry },
    ])
    const revokedConfirm = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "confirm_business", { enquiryId: revokedEnquiry, businessId: onlyRevoked },
    ])
    expect(revokedConfirm).toMatchObject({ status: "denied", exception: "revoked_membership" })
  })

  it("leaves a non-Telloya onboarding untouched and serialises concurrent posts", async () => {
    const completeId = await telloyaEnquiry("sales.context.complete@example.test", "Complete Yard")
    const opened = await commercial("classify", {
      enquiryId: completeId,
      product: "COMPLETE",
      reason: prepareReason,
    }, 0)
    expect(opened.status).toBe("success")
    const refused = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId: completeId },
    ])
    expect(refused).toMatchObject({ status: "conflict", reason: "product" })
    expect((await rows<{ product_code: string }>(
      `select product_code from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [completeId],
    ))).toEqual([{ product_code: "COMPLETE" }])

    const cleanId = await telloyaEnquiry("sales.context.serial@example.test", "Serial Yard")
    const [a, b] = await Promise.all([
      rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [token, randomUUID(), "bootstrap", { enquiryId: cleanId }]),
      rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [token, randomUUID(), "bootstrap", { enquiryId: cleanId }]),
    ])
    expect([a.status, b.status].every(status => status === "success")).toBe(true)
    expect((await rows<{ id: string }>(
      `select id from public.onboarding_requests where enquiry_id = $1 and state not in ('CLOSED','DECLINED')`,
      [cleanId],
    ))).toHaveLength(1)
    expect((await rows<{ id: string }>(`select id from public.customers where lower(email) = lower($1)`, ["sales.context.serial@example.test"]))).toHaveLength(1)
  })

  it("creates a location then prepares an offer through the shared commercial command", async () => {
    const email = "sales.context.offer@example.test"
    const enquiryId = await telloyaEnquiry(email, "Offer Yard", "Offer Yard floor")
    const boot = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(boot.status).toBe("success")
    expect(boot.exception).toBe("confirm_operating_location")
    let current = await requestVersion(enquiryId)
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
        locationName: "Offer Yard floor",
        country: "United Kingdom",
      },
    ])
    expect(located.status).toBe("success")
    current = await requestVersion(enquiryId)
    const prepared = await commercial("prepare_offer", {
      enquiryId,
      planVersionId: telloyaCataloguePlans.growthCap1,
      guardLocationIds: [],
      reason: prepareReason,
    }, current.record_version)
    expect(prepared.status).toBe("success")
    const offer = (await rows<{ amount_minor: number; public_ref: string; state: string }>(
      `select sub.amount_minor, sub.public_ref, sub.state
       from public.commercial_subscriptions sub
       join public.onboarding_requests request on request.commercial_subscription_id = sub.id
       where request.enquiry_id = $1 and request.state not in ('CLOSED','DECLINED')`,
      [enquiryId],
    ))[0]
    expect(offer).toMatchObject({ amount_minor: 7900, state: "OFFERED" })
    expect(offer.public_ref).toMatch(/^VC-/)
    expect((await rows<{ id: string }>("select id from public.communications where channel = 'EMAIL' and lifecycle = 'QUEUED'")).length).toBe(0)
  })

  it("refuses bootstrap before the demonstration is completed", async () => {
    const payload = {
      fullName: "Alex Owner",
      email: "sales.context.nodemo@example.test",
      phone: "07123456789",
      businessName: "No Demo Yard",
      country: "United Kingdom",
      service: "telloya",
      subject: "Telloya",
      details: "Waiting",
      source: "telloya",
      planTier: "basic",
    }
    const enquiryId = (await db.query<{ id: string }>(
      `insert into public.enquiries(submission_key, fingerprint, source, payload, internal_status, ack_status)
       values (gen_random_uuid(), md5($1::text), 'telloya', $1::jsonb, 'SKIPPED', 'SKIPPED') returning id`,
      [JSON.stringify(payload)],
    )).rows[0].id
    const denied = await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    expect(denied).toMatchObject({ status: "denied", reason: "demonstration_not_completed" })
  })

  it("does not open Guided or Guard product onboarding from Telloya bootstrap", async () => {
    const enquiryId = await telloyaEnquiry("sales.context.product@example.test", "Product Yard")
    await rpc<Record<string, unknown>>("telloya_sales_context_command_v1", [
      token, randomUUID(), "bootstrap", { enquiryId },
    ])
    const products = await rows<{ product_code: string }>(
      `select product_code from public.onboarding_requests where enquiry_id = $1`,
      [enquiryId],
    )
    expect(products).toEqual([{ product_code: "TELLOYA" }])
  })
})
