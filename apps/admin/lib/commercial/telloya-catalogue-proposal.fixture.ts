/**
 * Copies the Telloya catalogue proposal into an isolated database as DRAFT.
 *
 * Do not run this against hosted DEV or Production. It does not approve a
 * plan, an agreement, or a tax treatment. The EXCLUSIVE tax value is the
 * local placeholder from telloyaTaxDecision and is not a production policy.
 */

import {
  telloyaCatalogueProposal,
  telloyaDraftAgreement,
  telloyaLocationPolicy,
  telloyaProposalPlans,
  telloyaTaxDecision,
} from "./telloya-catalogue-proposal"

const agreementId = "c03c0000-0000-4000-8000-000000001001"
const confirmations = JSON.stringify(telloyaDraftAgreement.confirmations)

const priced = [
  {
    id: telloyaProposalPlans.basic,
    conditionId: "c03c0000-0000-4000-8000-000000002001",
    version: 9301,
    tier: "BASIC",
    label: "Basic",
    amount: telloyaCatalogueProposal.prices.basicMinor,
    minutes: telloyaCatalogueProposal.prices.basicMinutes,
  },
  {
    id: telloyaProposalPlans.growth,
    conditionId: "c03c0000-0000-4000-8000-000000002002",
    version: 9302,
    tier: "GROWTH",
    label: "Growth",
    amount: telloyaCatalogueProposal.prices.growthMinor,
    minutes: telloyaCatalogueProposal.prices.growthMinutes,
  },
  {
    id: telloyaProposalPlans.pro,
    conditionId: "c03c0000-0000-4000-8000-000000002003",
    version: 9303,
    tier: "PRO",
    label: "Pro",
    amount: telloyaCatalogueProposal.prices.proMinor,
    minutes: telloyaCatalogueProposal.prices.proMinutes,
  },
] as const

type Sql = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

export async function installTelloyaCatalogueProposal(db: Sql): Promise<void> {
  if (telloyaTaxDecision.productionTaxBehaviour !== null) {
    throw new Error("The proposal installer cannot run once a production tax behaviour has been chosen.")
  }
  await db.query(
    `insert into public.product_catalogue(code, name, kind, status) values
      ('TELLOYA', 'Telloya', 'STANDALONE', 'DRAFT'),
      ('COMPLETE', 'Complete', 'BUNDLE', 'DRAFT')
     on conflict (code) do nothing`,
  )
  await db.query(
    `insert into public.commercial_agreement_versions(
      id, product_code, version_ref, title, body_text, cancellation_text, content_hash,
      required_confirmations, status
    )
    select $1, 'TELLOYA', $2, $3, $4, $5,
      admin_private.commercial_agreement_hash_v1('TELLOYA', $2, $3, $4, $5, $6::jsonb),
      $6::jsonb, 'DRAFT'
    where not exists (
      select 1 from public.commercial_agreement_versions
      where product_code = 'TELLOYA' and version_ref = $2
    )`,
    [
      agreementId,
      telloyaDraftAgreement.versionRef,
      telloyaDraftAgreement.title,
      telloyaDraftAgreement.body,
      telloyaDraftAgreement.cancellation,
      confirmations,
    ],
  )
  for (const plan of priced) {
    await db.query(
      `insert into public.plan_versions(
        id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
        amount_minor, tax_behaviour, terms_ref
      )
      select $1, 'TELLOYA', $2, $3, 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', $4, $5, $6
      where not exists (select 1 from public.plan_versions where id = $1)`,
      [plan.id, plan.version, plan.tier, plan.amount, telloyaTaxDecision.localDraftPlaceholder, telloyaDraftAgreement.versionRef],
    )
    await db.query(
      `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
       select $1, 'TELLOYA', $2, 'LOCATION'
       where not exists (
         select 1 from public.plan_components where plan_version_id = $1 and component_code = 'TELLOYA'
       )`,
      [plan.id, telloyaLocationPolicy.standardLocations],
    )
    await db.query(
      `insert into public.commercial_plan_conditions(
        id, plan_version_id, tier_code, tier_label, included_minutes, minutes_rollover,
        base_amount_minor, guard_unit_amount_minor, overage_rate_minor, content_hash, status
      )
      select $1, $2, $3, $4, $5, false, $6, $7, $8,
        admin_private.commercial_plan_conditions_hash_v1($3, $5, false, $6, $7, $8),
        'DRAFT'
      where not exists (
        select 1 from public.commercial_plan_conditions where plan_version_id = $2
      )`,
      [
        plan.conditionId,
        plan.id,
        plan.tier,
        plan.label,
        plan.minutes,
        plan.amount,
        telloyaCatalogueProposal.prices.guardLocationMinor,
        telloyaCatalogueProposal.prices.overagePerMinuteMinor,
      ],
    )
  }
  await db.query(
    `insert into public.plan_versions(
      id, product_code, version_number, tier_code, status, effective_from, billing_cadence, currency,
      amount_minor, tax_behaviour, terms_ref
    )
    select $1, 'TELLOYA', 9304, 'CUSTOM', 'DRAFT', now() - interval '1 day', 'MONTH', 'GBP', NULL, NULL, $2
    where not exists (select 1 from public.plan_versions where id = $1)`,
    [telloyaProposalPlans.custom, telloyaDraftAgreement.versionRef],
  )
  await db.query(
    `insert into public.plan_components(plan_version_id, component_code, quantity_limit, scope)
     select $1, 'TELLOYA', 1, 'LOCATION'
     where not exists (
       select 1 from public.plan_components where plan_version_id = $1 and component_code = 'TELLOYA'
     )`,
    [telloyaProposalPlans.custom],
  )
  // Quantity 1 keeps the unpriced template valid. It is not a Custom quotation.
  // A quotation names its own location quantity, number quantity, and price.
}
