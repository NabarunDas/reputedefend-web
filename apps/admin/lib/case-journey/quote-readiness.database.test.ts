/**
 * ADMIN-JOURNEY-06 readiness on a disposable database.
 * The migrations are applied only inside this test. They are not applied to DEV
 * or Production.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const admin = "c2910000-0000-4000-8000-0000000000a1"
const customer = "c2910000-0000-4000-8000-0000000000c1"
const business = "c2910000-0000-4000-8000-000000000022"
const pendingBusiness = "c2910000-0000-4000-8000-000000000032"
const foreignBusiness = "c2910000-0000-4000-8000-000000000042"
const missingBusiness = "c2910000-0000-4000-8000-000000000052"
const location = "c2910000-0000-4000-8000-000000000023"
const pendingLocation = "c2910000-0000-4000-8000-000000000033"
const foreignLocation = "c2910000-0000-4000-8000-000000000043"
const missingLocation = "c2910000-0000-4000-8000-000000000053"
const caseGb = "c2910000-0000-4000-8000-000000000024"
const casePending = "c2910000-0000-4000-8000-000000000025"
const caseForeign = "c2910000-0000-4000-8000-000000000026"
const caseMissing = "c2910000-0000-4000-8000-000000000027"
const token = "e".repeat(64)
const evidence = "Synthetic record of where this purchasing business belongs. It is not a Google listing and not a tax approval."

type Readiness = {
  status?: string
  countryCode?: string | null
  legalName?: string | null
  sellerVat?: string
  taxPath?: string
}

async function rpc<T = Readiness>(name: string, args: unknown[] = []) {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

function establishment(businessId: string, countryCode: string, legalName: string, status: "VERIFIED" | "PENDING", taxId: string | null = null) {
  return rpc("admin_record_business_establishment_v1", [token, randomUUID(), {
    businessId,
    countryCode,
    legalName,
    evidenceType: "OTHER",
    evidenceReference: evidence,
    verificationStatus: status,
    taxId,
  }])
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values ('${admin}', 'admin@profilerelaunch.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${admin}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${token}', '${admin}', now());
    insert into public.customers(id, full_name, email) values ('${customer}', 'Alex', 'alex@example.com');
    insert into public.businesses(id, display_name) values
      ('${business}', 'Harbour Bakery'),
      ('${pendingBusiness}', 'Pending Bakery'),
      ('${foreignBusiness}', 'Boulangerie'),
      ('${missingBusiness}', 'Unrecorded Bakery');
    insert into public.locations(id, business_id, country, location_name) values
      ('${location}', '${business}', 'United Kingdom', 'High Street'),
      ('${pendingLocation}', '${pendingBusiness}', 'United Kingdom', 'Side Street'),
      ('${foreignLocation}', '${foreignBusiness}', 'United Kingdom', 'Listed in the UK'),
      ('${missingLocation}', '${missingBusiness}', 'United Kingdom', 'Listing only');
  `)
  for (const [id, businessId, locationId] of [
    [caseGb, business, location],
    [casePending, pendingBusiness, pendingLocation],
    [caseForeign, foreignBusiness, foreignLocation],
    [caseMissing, missingBusiness, missingLocation],
  ]) {
    await db.query(
      `insert into public.cases(
        id, case_type, customer_id, business_id, location_id, issue_description, created_at,
        information_accurate_at, privacy_accepted_at, service_track
      ) values ($1, 'PROFILE_RECOVERY', $2, $3, $4, 'Synthetic issue kept inside this database.', '2026-01-01', now(), now(), 'UNDECIDED')`,
      [id, customer, businessId, locationId],
    )
  }
}, 180000)

afterAll(async () => { await db.close() })

describe("admin quote readiness", () => {
  it("reads one verified United Kingdom establishment and ignores the Google listing and tax identifier", async () => {
    const saved = await establishment(business, "GB", "Harbour Bakery Ltd", "VERIFIED", "GB999999999")
    expect(saved).toMatchObject({ status: "success", countryCode: "GB", verificationStatus: "VERIFIED" })
    const reading = await rpc("admin_case_quote_readiness_v1", [token, caseGb])
    expect(reading).toEqual({
      status: "verified",
      countryCode: "GB",
      legalName: "Harbour Bakery Ltd",
      sellerVat: "NOT_VAT_REGISTERED",
      taxPath: "uk_not_charged",
    })
    expect(JSON.stringify(reading)).not.toContain("GB999999999")
    expect(JSON.stringify(reading)).not.toContain("United Kingdom")
    const definition = (await db.query<{ def: string }>(
      "select pg_get_functiondef('public.admin_case_quote_readiness_v1(text,uuid)'::regprocedure) as def",
    )).rows[0].def
    expect(definition).not.toMatch(/locations|tax_id|evidence_reference/)
    const privileges = (await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select
        has_function_privilege('anon', 'public.admin_case_quote_readiness_v1(text,uuid)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.admin_case_quote_readiness_v1(text,uuid)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.admin_case_quote_readiness_v1(text,uuid)', 'execute') as service_role
    `)).rows[0]
    expect(privileges).toEqual({ anon: false, authenticated: false, service_role: true })
  })

  it("does not replace a verified purchaser and does not treat a pending note as verified", async () => {
    const sameCountry = await establishment(business, "GB", "A Different Legal Name Ltd", "VERIFIED")
    expect(sameCountry).toMatchObject({ status: "success", verificationStatus: "VERIFIED" })
    expect((await rpc("admin_case_quote_readiness_v1", [token, caseGb])).legalName).toBe("Harbour Bakery Ltd")
    const otherCountry = await establishment(business, "FR", "Boulangerie SARL", "VERIFIED")
    expect(otherCountry).toMatchObject({ status: "conflict", reason: "conflicting_establishment" })
    expect(await rpc("admin_case_quote_readiness_v1", [token, caseGb])).toMatchObject({
      status: "verified", countryCode: "GB", legalName: "Harbour Bakery Ltd", taxPath: "uk_not_charged",
    })

    expect((await establishment(pendingBusiness, "GB", "Pending Bakery Ltd", "PENDING")).status).toBe("success")
    expect(await rpc("admin_case_quote_readiness_v1", [token, casePending])).toMatchObject({
      status: "pending", countryCode: null, legalName: null, taxPath: "unavailable",
    })
    expect(await rpc("admin_case_quote_readiness_v1", [token, caseMissing])).toMatchObject({
      status: "missing", countryCode: null, legalName: null, taxPath: "unavailable",
    })
  })

  it("does not apply the United Kingdom treatment overseas, when seller VAT is unknown, or when establishments conflict", async () => {
    expect((await establishment(foreignBusiness, "FR", "Boulangerie SARL", "VERIFIED")).status).toBe("success")
    expect(await rpc("admin_case_quote_readiness_v1", [token, caseForeign])).toEqual({
      status: "verified",
      countryCode: "FR",
      legalName: "Boulangerie SARL",
      sellerVat: "NOT_VAT_REGISTERED",
      taxPath: "review",
    })

    await db.exec("begin")
    await db.exec("alter table public.seller_vat_position disable trigger seller_vat_position_immutable")
    await db.query("update public.seller_vat_position set effective_from = now() + interval '1 day'")
    const unknownSeller = await rpc("admin_case_quote_readiness_v1", [token, caseGb])
    await db.exec("rollback")
    expect(unknownSeller).toMatchObject({ status: "verified", countryCode: "GB", sellerVat: "UNKNOWN", taxPath: "review" })
    expect((await rpc("admin_case_quote_readiness_v1", [token, caseGb])).sellerVat).toBe("NOT_VAT_REGISTERED")

    await db.exec("begin")
    await db.exec("drop index public.business_establishments_current_verified_uidx")
    await db.query(
      `insert into public.business_establishments(
        business_id, country_code, legal_name, evidence_type, evidence_reference,
        verification_status, verified_by, verified_at, recorded_by, request_id, payload_fingerprint
      ) values ($1, 'FR', 'Second Establishment SARL', 'OTHER', $2, 'VERIFIED', $3, now(), $3, $4, 'second-verified')`,
      [business, evidence, admin, randomUUID()],
    )
    const conflicting = await rpc("admin_case_quote_readiness_v1", [token, caseGb])
    await db.exec("rollback")
    expect(conflicting).toMatchObject({ status: "conflicting", countryCode: null, legalName: null, taxPath: "review" })
    expect((await rpc("admin_case_quote_readiness_v1", [token, caseGb])).status).toBe("verified")
  })

  it("returns nothing for a bad or revoked session", async () => {
    expect(await rpc("admin_case_quote_readiness_v1", ["f".repeat(64), caseGb])).toBeNull()
    await db.query("update public.admin_sessions set revoked_at = now() where token_hash = $1", [token])
    expect(await rpc("admin_case_quote_readiness_v1", [token, caseGb])).toBeNull()
    await db.query("update public.admin_sessions set revoked_at = null, created_at = now() where token_hash = $1", [token])
    expect(await rpc("admin_case_quote_readiness_v1", [token, randomUUID()])).toEqual({ status: "unavailable" })
    expect((await rpc("admin_case_quote_readiness_v1", [token, caseGb])).status).toBe("verified")
  })
})
