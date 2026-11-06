/**
 * Isolated rehearsal catalogue for Telloya commercial tests.
 *
 * Do not insert this fixture into hosted DEV. Do not insert it into Production.
 * The agreement text is a test marker. It is not a legal agreement and it is
 * not approved for a customer. The owner has approved one location and one
 * receptionist number for Basic, Growth and Pro. The cap-2 Growth row stays
 * unapproved. The cap-2 Custom row is a separate quotation rehearsal.
 */

export const telloyaCatalogueFixtureMarker = "TEST ONLY. This is not a legal agreement and it is not approved for a customer."

export const telloyaLocationCapDecision = {
  status: "REHEARSAL ONLY" as const,
  approvedStandardLocations: 1,
  approvedStandardNumbers: 1,
  rehearsalCaps: { BASIC: [1], GROWTH: [1, 2], PRO: [1], CUSTOM: [1, 2] },
  statement:
    "The owner approved one Telloya operating location and one receptionist number for Basic, Growth and Pro. The Growth quantity_limit 2 row stays DRAFT. Approving it is rejected. The Custom quantity_limit 2 row is a separate quotation rehearsal and is not a standard plan.",
}

export const telloyaPublishedPrices = {
  basicMinor: 4900,
  growthMinor: 7900,
  proMinor: 12000,
  guardLocationMinor: 999,
  overagePerMinuteMinor: 25,
  /** A quotation used only so a matching cap can be accepted in a test. */
  testCustomQuotationMinor: 15000,
  /** A two-location quotation used only in the local rehearsal. Not a customer price. */
  testCustomTwoLocationMinor: 25000,
}

export const telloyaCataloguePlans = {
  basicCap1: "c01c0000-0000-4000-8000-000000000001",
  growthCap1: "c01c0000-0000-4000-8000-000000000002",
  growthCap2: "c01c0000-0000-4000-8000-000000000003",
  proCap1: "c01c0000-0000-4000-8000-000000000004",
  customCap1: "c01c0000-0000-4000-8000-000000000005",
  customCap2: "c01c0000-0000-4000-8000-000000000006",
} as const

const agreementBody = `${telloyaCatalogueFixtureMarker} It names the selected locations and the amount shown on the offer only.`
const cancellation = "TEST ONLY. This cancellation sentence is not a customer term."
const confirmations = JSON.stringify([{ key: "business_authority", label: "I can accept this offer for the business." }])

const plans = [
  { id: telloyaCataloguePlans.basicCap1, agreementId: "c01c0000-0000-4000-8000-000000001001", conditionId: "c01c0000-0000-4000-8000-000000002001", version: 9101, tier: "BASIC", label: "Basic", amount: 4900, minutes: 120 as number | null, cap: 1, guard: 999 as number | null, overage: 25 as number | null, ref: "TELLOYA-TEST-BASIC-CAP-1" },
  { id: telloyaCataloguePlans.growthCap1, agreementId: "c01c0000-0000-4000-8000-000000001002", conditionId: "c01c0000-0000-4000-8000-000000002002", version: 9102, tier: "GROWTH", label: "Growth", amount: 7900, minutes: 300, cap: 1, guard: 999, overage: 25, ref: "TELLOYA-TEST-GROWTH-CAP-1" },
  { id: telloyaCataloguePlans.growthCap2, agreementId: "c01c0000-0000-4000-8000-000000001003", conditionId: "c01c0000-0000-4000-8000-000000002003", version: 9103, tier: "GROWTH", label: "Growth", amount: 7900, minutes: 300, cap: 2, guard: 999, overage: 25, ref: "TELLOYA-TEST-GROWTH-CAP-2" },
  { id: telloyaCataloguePlans.proCap1, agreementId: "c01c0000-0000-4000-8000-000000001004", conditionId: "c01c0000-0000-4000-8000-000000002004", version: 9104, tier: "PRO", label: "Pro", amount: 12000, minutes: 500, cap: 1, guard: 999, overage: 25, ref: "TELLOYA-TEST-PRO-CAP-1" },
  { id: telloyaCataloguePlans.customCap1, agreementId: "c01c0000-0000-4000-8000-000000001005", conditionId: "c01c0000-0000-4000-8000-000000002005", version: 9105, tier: "CUSTOM", label: "Custom", amount: 15000, minutes: null, cap: 1, guard: null, overage: null, ref: "TELLOYA-TEST-CUSTOM-CAP-1" },
  { id: telloyaCataloguePlans.customCap2, agreementId: "c01c0000-0000-4000-8000-000000001006", conditionId: "c01c0000-0000-4000-8000-000000002006", version: 9106, tier: "CUSTOM", label: "Custom", amount: telloyaPublishedPrices.testCustomTwoLocationMinor, minutes: null, cap: 2, guard: null, overage: null, ref: "TELLOYA-TEST-CUSTOM-CAP-2" },
] as const

type Sql = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export async function installTelloyaCatalogueFixture(db: Sql, actorId: string): Promise<void> {
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  for (const plan of plans) {
    await db.query(
      `insert into public.commercial_agreement_versions(
        id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
        required_confirmations, status, approved_by, approved_at
      )
      select $1, 'TELLOYA', $2, $3, $4, $5,
        admin_private.commercial_agreement_hash_v1('TELLOYA', $2, $3, $4, $5, $6::jsonb),
        $6::jsonb, 'APPROVED', $7, now()
      where not exists (
        select 1 from public.commercial_agreement_versions
        where product_code = 'TELLOYA' and version_ref = $2
      )`,
      [plan.agreementId, plan.ref, "Telloya test agreement", agreementBody, cancellation, confirmations, actorId],
    )
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      )
      select $1, 'TELLOYA', $2, $3, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', $4, 'NOT_APPLICABLE', $5
      where not exists (select 1 from public.plan_versions where id = $1)`,
      [plan.id, plan.version, plan.tier, plan.amount, plan.ref],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       select $1, 'TELLOYA', $2, 'LOCATION'
       where not exists (
         select 1 from public.plan_components where plan_version_id = $1 and component_code = 'TELLOYA'
       )`,
      [plan.id, plan.cap],
    )
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash,
        status, approved_by, approved_at
      )
      select $1, $2, $3, $4, $5, false, $6, $7, $8,
        admin_private.commercial_plan_conditions_hash_v1($3, $5, false, $6, $7, $8),
        'APPROVED', $9, now()
      where not exists (
        select 1 from public.commercial_plan_conditions where plan_version_id = $2
      )`,
      [plan.conditionId, plan.id, plan.tier, plan.label, plan.minutes, plan.amount, plan.guard, plan.overage, actorId],
    )
    const standardTier = plan.tier === "BASIC" || plan.tier === "GROWTH" || plan.tier === "PRO"
    if (!standardTier || plan.cap === 1) {
      await db.query(
        `update public.plan_versions
         set status = 'APPROVED', approved_by = $2, approved_at = now()
         where id = $1 and status = 'DRAFT'`,
        [plan.id, actorId],
      )
    }
  }
}
