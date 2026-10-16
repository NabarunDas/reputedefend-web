import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url)
const appliedPath = new URL("20260915193000_case_intake_transaction_v1.sql", migrationsDir)
const proposalPath = new URL("../../docs/customer/proposed-intake-country-key-v1.sql", import.meta.url)
const appliedSql = readFileSync(appliedPath, "utf8")
const proposalSql = readFileSync(proposalPath, "utf8")
const countryComparison = "public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country)"
const countryKeyComparison = "public._intake_country_key(matched_location.country) = public._intake_country_key(v_country)"
const profileUrl = "https://www.google.com/maps/place/?q=place_id:ChIJharbour"

const db = new PGlite()

type IntakeRow = {
  case_id: string
  customer_id: string
  business_id: string
  location_id: string
  was_existing: boolean
}

type Seed = {
  customerId: string
  businessId: string
  locationId: string
}

type Totals = {
  customers: number
  businesses: number
  locations: number
  cases: number
}

function appliedFunction() {
  const start = appliedSql.indexOf("CREATE OR REPLACE FUNCTION public.create_case_intake_v1(")
  const end = appliedSql.indexOf("REVOKE ALL ON FUNCTION public._intake_norm_text(text) FROM PUBLIC;")
  return appliedSql.slice(start, end).trim()
}

async function totals() {
  const result = await db.query<Totals>(`
    select
      (select count(*)::int from public.customers) as customers,
      (select count(*)::int from public.businesses) as businesses,
      (select count(*)::int from public.locations) as locations,
      (select count(*)::int from public.cases) as cases
  `)
  return result.rows[0]
}

async function rolled(run: () => Promise<void>) {
  await db.exec("BEGIN")
  try {
    expect(await totals()).toEqual({ customers: 0, businesses: 0, locations: 0, cases: 0 })
    await run()
  } finally {
    await db.exec("ROLLBACK")
  }
}

async function seed(options: {
  email: string
  business: string
  country: string
  website?: string | null
  profile?: string | null
}): Promise<Seed> {
  const customer = await db.query<{ id: string }>(
    "insert into public.customers (full_name, email) values ('Alex Example', $1) returning id",
    [options.email],
  )
  const business = await db.query<{ id: string }>(
    "insert into public.businesses (display_name, website_url) values ($1, $2) returning id",
    [options.business, options.website ?? null],
  )
  const location = await db.query<{ id: string }>(
    "insert into public.locations (business_id, country, business_profile_url) values ($1, $2, $3) returning id",
    [business.rows[0].id, options.country, options.profile ?? null],
  )
  await db.query(
    `insert into public.cases (case_type, customer_id, business_id, location_id, issue_description)
     values ('PROFILE_RECOVERY', $1, $2, $3, 'Historical profile issue.')`,
    [customer.rows[0].id, business.rows[0].id, location.rows[0].id],
  )
  return {
    customerId: customer.rows[0].id,
    businessId: business.rows[0].id,
    locationId: location.rows[0].id,
  }
}

async function intake(options: {
  email: string
  business: string
  country: string
  website?: string | null
  profile?: string | null
  key?: string
}) {
  const key = options.key ?? crypto.randomUUID()
  const result = await db.query<IntakeRow>(
    `select case_id, customer_id, business_id, location_id, was_existing
     from public.create_case_intake_v1(
       $1::uuid, 'PROFILE_RECOVERY', null, 'Alex Example', $2, null, $3, $4, $5, $6, null,
       'The profile was suspended and we need help.', true, true, '{}'::jsonb, 'ops@example.com'
     )`,
    [key, options.email, options.business, options.country, options.website ?? null, options.profile ?? null],
  )
  return { key, row: result.rows[0] }
}

async function locationCountry(id: string) {
  const result = await db.query<{ country: string; business_profile_url: string | null }>(
    "select country, business_profile_url from public.locations where id = $1",
    [id],
  )
  return result.rows[0]
}

beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;")
  const core = readFileSync(new URL("20260915120000_core_data_foundation_v1.sql", migrationsDir), "utf8")
  await db.exec(core.replace(
    "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;",
    "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'; CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  ))
  await db.exec(appliedSql)
}, 30000)

afterAll(async () => {
  await db.close()
})

describe("legacy country matching", () => {
  it("keeps the proposed country key out of the applied migration chain", () => {
    const appliedFunctionSql = appliedFunction()
    expect(appliedFunctionSql.split(countryComparison)).toHaveLength(5)
    expect(appliedSql).not.toContain("_intake_country_key")
    expect(proposalSql).toContain(appliedFunctionSql.replaceAll(countryComparison, countryKeyComparison))
    expect(proposalSql.split(countryKeyComparison)).toHaveLength(5)
    expect(proposalSql).not.toContain(countryComparison)
    expect(proposalSql).not.toMatch(/CREATE OR REPLACE FUNCTION public\._intake_norm_text/)
    expect(proposalSql).not.toMatch(/UPDATE public\.locations/)
    expect(proposalSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._intake_country_key/)
    const filenames = readdirSync(migrationsDir)
    expect(filenames).not.toContain("proposed-intake-country-key-v1.sql")
    for (const filename of filenames) {
      expect(readFileSync(new URL(filename, migrationsDir), "utf8")).not.toContain("_intake_country_key")
    }
  })

  it("does not treat UK and GB as the same normalised text", async () => {
    const result = await db.query<{ uk: string; gb: string; equal: boolean; name: string }>(
      `select public._intake_norm_text('UK') as uk,
              public._intake_norm_text('GB') as gb,
              public._intake_norm_text('UK') = public._intake_norm_text('GB') as equal,
              public._intake_norm_text('Harbour  Bakery') as name`,
    )
    expect(result.rows[0]).toEqual({ uk: "uk", gb: "gb", equal: false, name: "harbour bakery" })
  })

  it("creates a duplicate business and location when a stored UK record is submitted as GB", async () => {
    await rolled(async () => {
      const same = await seed({ email: "same@example.com", business: "Harbour Bakery", country: "UK" })
      const repeated = await intake({ email: "same@example.com", business: "Harbour Bakery", country: "UK" })
      expect(repeated.row.was_existing).toBe(false)
      expect(repeated.row.business_id).toBe(same.businessId)
      expect(repeated.row.location_id).toBe(same.locationId)

      const stored = await seed({ email: "legacy@example.com", business: "Harbour Bakery", country: "UK" })
      const before = await totals()
      const created = await intake({ email: "legacy@example.com", business: "Harbour Bakery", country: "GB" })
      expect(created.row.was_existing).toBe(false)
      expect(created.row.customer_id).toBe(stored.customerId)
      expect(created.row.business_id).not.toBe(stored.businessId)
      expect(created.row.location_id).not.toBe(stored.locationId)
      expect(await totals()).toEqual({
        customers: before.customers,
        businesses: before.businesses + 1,
        locations: before.locations + 1,
        cases: before.cases + 1,
      })
      expect(await locationCountry(stored.locationId)).toMatchObject({ country: "UK", business_profile_url: null })
    })
  })

  it("creates the same duplicate when the Google Business Profile URL matches", async () => {
    await rolled(async () => {
      const stored = await seed({
        email: "maps@example.com",
        business: "Harbour Bakery",
        country: "UK",
        profile: profileUrl,
      })
      const created = await intake({
        email: "maps@example.com",
        business: "Harbour Bakery",
        country: "GB",
        profile: profileUrl,
      })
      expect(created.row.was_existing).toBe(false)
      expect(created.row.business_id).not.toBe(stored.businessId)
      expect(created.row.location_id).not.toBe(stored.locationId)
      expect(await locationCountry(stored.locationId)).toEqual({ country: "UK", business_profile_url: profileUrl })
      expect(await totals()).toMatchObject({ businesses: 2, locations: 2, cases: 2 })
    })
  })

  it("returns the existing case when the same submission key is repeated", async () => {
    await rolled(async () => {
      await seed({ email: "retry@example.com", business: "Harbour Bakery", country: "UK" })
      const first = await intake({ email: "retry@example.com", business: "Harbour Bakery", country: "GB" })
      const afterFirst = await totals()
      const second = await intake({
        email: "retry@example.com",
        business: "Harbour Bakery",
        country: "GB",
        key: first.key,
      })
      expect(first.row.was_existing).toBe(false)
      expect(second.row).toMatchObject({
        was_existing: true,
        case_id: first.row.case_id,
        business_id: first.row.business_id,
        location_id: first.row.location_id,
      })
      expect(await totals()).toEqual(afterFirst)
    })
  })

  it("reuses one UK, uk, or United Kingdom business when the proposal is applied inside a rollback", async () => {
    await rolled(async () => {
      await db.exec(proposalSql)
      const keys = await db.query<{ uk: string; gb: string; name: string; ukraine: string; us: string }>(`
        select public._intake_country_key('UK') as uk,
               public._intake_country_key(' United Kingdom ') as gb,
               public._intake_norm_text('UK') as name,
               public._intake_country_key('Ukraine') as ukraine,
               public._intake_country_key('US') as us
      `)
      expect(keys.rows[0]).toEqual({ uk: "gb", gb: "gb", name: "uk", ukraine: "ukraine", us: "us" })
      for (const alias of ["uk", "U.K.", "Great Britain", "Britain"]) {
        const aliasKey = await db.query<{ value: string }>("select public._intake_country_key($1) as value", [alias])
        expect(aliasKey.rows[0].value).toBe("gb")
      }

      for (const [index, country] of ["UK", "uk", "United Kingdom"].entries()) {
        const email = `legacy-${index}@example.com`
        const stored = await seed({ email, business: "Harbour Bakery", country })
        const created = await intake({ email, business: "Harbour Bakery", country: "GB" })
        expect(created.row.was_existing).toBe(false)
        expect(created.row.business_id).toBe(stored.businessId)
        expect(created.row.location_id).toBe(stored.locationId)
        expect(await locationCountry(stored.locationId)).toMatchObject({ country })
      }

      const current = await seed({ email: "current@example.com", business: "Harbour Bakery", country: "GB" })
      const again = await intake({ email: "current@example.com", business: "Harbour Bakery", country: "GB" })
      expect(again.row.business_id).toBe(current.businessId)
      expect(again.row.location_id).toBe(current.locationId)
    })
  })

  it("reuses the same Google Business Profile location after the proposal", async () => {
    await rolled(async () => {
      await db.exec(proposalSql)
      const stored = await seed({
        email: "maps-fixed@example.com",
        business: "Harbour Bakery",
        country: "UK",
        profile: profileUrl,
      })
      const created = await intake({
        email: "maps-fixed@example.com",
        business: "Harbour Bakery",
        country: "GB",
        profile: `${profileUrl}/`,
      })
      expect(created.row.business_id).toBe(stored.businessId)
      expect(created.row.location_id).toBe(stored.locationId)
      expect(await locationCountry(stored.locationId)).toEqual({ country: "UK", business_profile_url: profileUrl })
      expect(await totals()).toMatchObject({ businesses: 1, locations: 1, cases: 2 })
    })
  })

  it("keeps submission-key idempotency after the proposal", async () => {
    await rolled(async () => {
      await db.exec(proposalSql)
      await seed({ email: "retry-fixed@example.com", business: "Harbour Bakery", country: "UK" })
      const first = await intake({ email: "retry-fixed@example.com", business: "Harbour Bakery", country: "GB" })
      const afterFirst = await totals()
      const second = await intake({
        email: "retry-fixed@example.com",
        business: "Harbour Bakery",
        country: "GB",
        key: first.key,
      })
      expect(second.row).toMatchObject({ was_existing: true, case_id: first.row.case_id })
      expect(await totals()).toEqual(afterFirst)
    })
  })

  it("does not merge different businesses, countries, customers, locations, or websites", async () => {
    await rolled(async () => {
      await db.exec(proposalSql)

      const otherName = await seed({ email: "name@example.com", business: "UK Bakery", country: "UK" })
      const renamed = await intake({ email: "name@example.com", business: "GB Bakery", country: "GB" })
      expect(renamed.row.business_id).not.toBe(otherName.businessId)

      const otherCountry = await seed({ email: "us@example.com", business: "Harbour Bakery", country: "US" })
      const unitedStates = await intake({ email: "us@example.com", business: "Harbour Bakery", country: "GB" })
      expect(unitedStates.row.business_id).not.toBe(otherCountry.businessId)

      const ukraine = await seed({ email: "ua@example.com", business: "Harbour Bakery", country: "Ukraine" })
      const notUnitedKingdom = await intake({ email: "ua@example.com", business: "Harbour Bakery", country: "GB" })
      expect(notUnitedKingdom.row.business_id).not.toBe(ukraine.businessId)

      const owner = await seed({ email: "owner@example.com", business: "Harbour Bakery", country: "UK" })
      const otherCustomer = await intake({ email: "other@example.com", business: "Harbour Bakery", country: "GB" })
      expect(otherCustomer.row.customer_id).not.toBe(owner.customerId)
      expect(otherCustomer.row.business_id).not.toBe(owner.businessId)

      const ambiguous = await seed({ email: "two@example.com", business: "Harbour Bakery", country: "UK" })
      await db.query(
        "insert into public.locations (business_id, country) values ($1, 'United Kingdom')",
        [ambiguous.businessId],
      )
      const third = await intake({ email: "two@example.com", business: "Harbour Bakery", country: "GB" })
      expect(third.row.business_id).toBe(ambiguous.businessId)
      expect(third.row.location_id).not.toBe(ambiguous.locationId)
      expect(await locationCountry(ambiguous.locationId)).toMatchObject({ country: "UK" })

      const literal = await seed({ email: "literal@example.com", business: "Harbour Bakery", country: "UK" })
      await db.query("insert into public.locations (business_id, country) values ($1, 'UK')", [literal.businessId])
      const stillAmbiguous = await intake({ email: "literal@example.com", business: "Harbour Bakery", country: "UK" })
      expect(stillAmbiguous.row.business_id).toBe(literal.businessId)
      expect(stillAmbiguous.row.location_id).not.toBe(literal.locationId)

      const profile = await seed({
        email: "profile@example.com",
        business: "Harbour Bakery",
        country: "UK",
        profile: profileUrl,
      })
      const otherProfile = await intake({
        email: "profile@example.com",
        business: "Harbour Bakery",
        country: "GB",
        profile: "https://www.google.com/maps/place/?q=place_id:different",
      })
      expect(otherProfile.row.business_id).toBe(profile.businessId)
      expect(otherProfile.row.location_id).not.toBe(profile.locationId)
      expect(await locationCountry(profile.locationId)).toEqual({ country: "UK", business_profile_url: profileUrl })

      const website = await seed({
        email: "site@example.com",
        business: "Harbour Bakery",
        country: "UK",
        website: "https://harbour.example",
      })
      const otherSite = await intake({
        email: "site@example.com",
        business: "Harbour Bakery",
        country: "GB",
        website: "https://other.example",
      })
      expect(otherSite.row.business_id).not.toBe(website.businessId)
      const storedSite = await db.query<{ website_url: string }>(
        "select website_url from public.businesses where id = $1",
        [website.businessId],
      )
      expect(storedSite.rows[0].website_url).toBe("https://harbour.example")
    })
  })

  it("revokes the country key from anon, authenticated, and service_role", async () => {
    await rolled(async () => {
      await db.exec(proposalSql)
      for (const role of ["anon", "authenticated", "service_role"]) {
        const privilege = await db.query<{ ok: boolean }>(
          "select has_function_privilege($1, 'public._intake_country_key(text)', 'EXECUTE') as ok",
          [role],
        )
        expect(privilege.rows[0].ok).toBe(false)
      }
    })
  })

  it("rolls the proposal back and leaves the applied comparison unchanged", async () => {
    await expect(db.query("select public._intake_country_key('UK')")).rejects.toThrow()
    const source = await db.query<{ prosrc: string }>(
      "select prosrc from pg_proc where proname = 'create_case_intake_v1'",
    )
    expect(source.rows).toHaveLength(1)
    expect(source.rows[0].prosrc).toContain("_intake_norm_text(matched_location.country)")
    expect(source.rows[0].prosrc).not.toContain("_intake_country_key")
    expect(await totals()).toEqual({ customers: 0, businesses: 0, locations: 0, cases: 0 })
  })
})
