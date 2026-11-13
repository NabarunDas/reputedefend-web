import { createHash } from "node:crypto"
import { overagePolicy, relaunchGuardAddon, telloyaPlans } from "../../../telloya/lib/pricing"

export type TelloyaPlanCode = "basic" | "growth" | "pro" | "custom"
export type TelloyaOfferStatus = "PREVIEW" | "DRAFT" | "SENT" | "SUPERSEDED" | "ACCEPTED"

export type TelloyaOfferVersion = {
  version: number
  status: TelloyaOfferStatus
  current: boolean
  planCode: TelloyaPlanCode
  planVersionId: string | null
  currency: "GBP"
  cadence: "MONTH"
  planAmountPence: number | null
  includedMinutes: number | null
  guardLocations: number
  guardAmountPence: number
  monthlyTotalPence: number | null
  voiceLocations: number
  phoneNumbers: number
  overageOptIn: boolean
  overageCapPence: number | null
  termsHash: string
  fixture: boolean
  blockers: string[]
}

export type TelloyaOfferInput = {
  demoStatus: "NOT_BOOKED" | "BOOKED" | "COMPLETED"
  businessAuthorityVerified: boolean
  exceptionRequested: boolean
  planCode: string
  planStatus: "APPROVED" | "DRAFT" | "MISSING"
  planVersionId: string | null
  amountPence: number | null
  includedMinutes: number | null
  guardLocations: number
  voiceLocations: number
  phoneNumbers: number
  overageOptIn: boolean
  overageCapPence: number | null
  fixture: boolean
}

const PLAN_CODES = new Set<TelloyaPlanCode>(["basic", "growth", "pro", "custom"])

export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100)
}

export function telloyaCataloguePence(planCode: string): { amountPence: number | null; includedMinutes: number | null } | null {
  const plan = telloyaPlans.find(item => item.tier === planCode)
  if (!plan) return null
  return {
    amountPence: plan.monthlyPriceGbp === null ? null : poundsToPence(plan.monthlyPriceGbp),
    includedMinutes: plan.minutesPerMonth,
  }
}

export const telloyaGuardLocationPence = poundsToPence(relaunchGuardAddon.pricePerLocationGbp)
export const telloyaOveragePence = poundsToPence(overagePolicy.pricePerMinuteGbp)

function hashTerms(input: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function blockersFor(input: TelloyaOfferInput): string[] {
  const blockers: string[] = []
  if (input.fixture) blockers.push("test_only_fixture")
  if (input.exceptionRequested) blockers.push("requires_owner_decision")
  if (input.demoStatus !== "COMPLETED") blockers.push("demonstration_not_completed")
  if (!input.businessAuthorityVerified) blockers.push("business_authority_unverified")
  if (!PLAN_CODES.has(input.planCode as TelloyaPlanCode)) blockers.push("plan_not_selected")
  if (input.planStatus !== "APPROVED" || !input.planVersionId) blockers.push("plan_not_approved")
  const catalogue = telloyaCataloguePence(input.planCode)
  if (input.planCode === "custom") {
    if (input.amountPence === null || input.includedMinutes === null) blockers.push("custom_requires_owner_approval")
  } else if (!catalogue || catalogue.amountPence === null || input.amountPence !== catalogue.amountPence || input.includedMinutes !== catalogue.includedMinutes) {
    blockers.push("price_not_approved")
  }
  if (!Number.isInteger(input.guardLocations) || input.guardLocations < 0 || input.guardLocations > 50) blockers.push("invalid_guard_locations")
  if (input.planCode !== "custom" && (input.voiceLocations !== 1 || input.phoneNumbers !== 1)) blockers.push("standard_tier_location_limit")
  if (input.voiceLocations < 1 || input.phoneNumbers < 1) blockers.push("invalid_service_quantity")
  if (input.overageOptIn) {
    if (!overagePolicy.requiresOptIn || !overagePolicy.requiresSpendingCap || !input.overageCapPence || input.overageCapPence <= 0) blockers.push("overage_cap_required")
  } else if (input.overageCapPence !== null) {
    blockers.push("overage_not_selected")
  }
  blockers.push("agreement_not_approved", "tax_not_approved")
  return blockers
}

export function prepareTelloyaOffer(existing: TelloyaOfferVersion[], input: TelloyaOfferInput): { result: string; versions: TelloyaOfferVersion[] } {
  const blockers = blockersFor(input)
  const planCode = input.planCode as TelloyaPlanCode
  const guardAmountPence = Number.isInteger(input.guardLocations) && input.guardLocations >= 0 ? input.guardLocations * telloyaGuardLocationPence : 0
  const priced = input.amountPence !== null && !blockers.includes("price_not_approved") && !blockers.includes("custom_requires_owner_approval") && !blockers.includes("invalid_guard_locations")
  const monthlyTotalPence = priced && input.amountPence !== null ? input.amountPence + guardAmountPence : null
  const terms = {
    planCode,
    planVersionId: input.planVersionId,
    amountPence: input.amountPence,
    includedMinutes: input.includedMinutes,
    guardLocations: input.guardLocations,
    guardAmountPence,
    monthlyTotalPence,
    voiceLocations: input.voiceLocations,
    phoneNumbers: input.phoneNumbers,
    overageOptIn: input.overageOptIn,
    overageCapPence: input.overageOptIn ? input.overageCapPence : null,
    currency: "GBP",
    cadence: "MONTH",
  }
  const termsHash = hashTerms(terms)
  const current = existing.find(version => version.current)
  if (current && current.termsHash === termsHash && current.fixture === input.fixture) {
    return { result: "duplicate", versions: existing }
  }
  const realBlockers = blockers.filter(item => item !== "agreement_not_approved" && item !== "tax_not_approved")
  if (!input.fixture && realBlockers.length > 0) return { result: realBlockers[0], versions: existing }
  const version: TelloyaOfferVersion = {
    version: existing.length + 1,
    status: input.fixture ? "PREVIEW" : "DRAFT",
    current: true,
    planCode,
    planVersionId: input.planVersionId,
    currency: "GBP",
    cadence: "MONTH",
    planAmountPence: input.amountPence,
    includedMinutes: input.includedMinutes,
    guardLocations: input.guardLocations,
    guardAmountPence,
    monthlyTotalPence,
    voiceLocations: input.voiceLocations,
    phoneNumbers: input.phoneNumbers,
    overageOptIn: input.overageOptIn,
    overageCapPence: input.overageOptIn ? input.overageCapPence : null,
    termsHash,
    fixture: input.fixture,
    blockers,
  }
  return {
    result: input.fixture ? "preview" : "draft",
    versions: [...existing.map(item => ({ ...item, current: false, status: item.status === "DRAFT" || item.status === "PREVIEW" ? item.status : "SUPERSEDED" as const })), version],
  }
}

export function sendTelloyaOffer(versions: TelloyaOfferVersion[], approval: { agreementStatus: string; taxApproval: string }): { result: string; versions: TelloyaOfferVersion[] } {
  const current = versions.find(version => version.current)
  if (!current || current.fixture || current.status !== "DRAFT") return { result: "send_closed", versions }
  if (approval.agreementStatus !== "APPROVED" || approval.taxApproval !== "APPROVED") return { result: "legal_or_tax_unapproved", versions }
  if (current.blockers.some(item => item !== "agreement_not_approved" && item !== "tax_not_approved")) return { result: "send_closed", versions }
  return {
    result: "queued",
    versions: versions.map(version => version.current ? { ...version, status: "SENT", blockers: [] } : version),
  }
}

export function formatGbpPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

export function previewTelloyaOffer(planCode: string | undefined, guardLocations: number | undefined) {
  const catalogue = planCode ? telloyaCataloguePence(planCode) : null
  return prepareTelloyaOffer([], {
    demoStatus: "NOT_BOOKED",
    businessAuthorityVerified: false,
    exceptionRequested: false,
    planCode: catalogue ? planCode ?? "" : "",
    planStatus: "MISSING",
    planVersionId: null,
    amountPence: catalogue?.amountPence ?? null,
    includedMinutes: catalogue?.includedMinutes ?? null,
    guardLocations: Number.isInteger(guardLocations) && (guardLocations ?? 0) >= 0 ? guardLocations ?? 0 : 0,
    voiceLocations: 1,
    phoneNumbers: 1,
    overageOptIn: false,
    overageCapPence: null,
    fixture: true,
  }).versions[0]
}
