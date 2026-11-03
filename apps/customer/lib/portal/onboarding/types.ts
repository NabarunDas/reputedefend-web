/**
 * Customer-facing onboarding progress. Stages come from recorded commercial
 * facts. A session, an email delivery, or a timestamp does not choose one.
 */

export const onboardingStages = [
  "received",
  "under_review",
  "verification",
  "offer_preparation",
  "awaiting_customer",
  "service_setup",
  "ready",
  "declined",
  "closed",
] as const

export type OnboardingStage = (typeof onboardingStages)[number]

export type OnboardingProductName = "Telloya" | "Complete"

export type OnboardingRequestView = {
  product: OnboardingProductName
  stage: OnboardingStage
  statusLabel: string
  waitingFor: "us" | "you"
  customerActionRequired: boolean
  businessName: string | null
  locations: string[] | null
  completed: string[]
  nextStep: string
  receivedAt: string
  updatedAt: string
}

export type OnboardingRead =
  | { status: "ready"; requests: OnboardingRequestView[] }
  | { status: "unavailable" }
  | { status: "unauthenticated" }

const STAGES = new Set<string>(onboardingStages)
const PRODUCTS = new Set<string>(["Telloya", "Complete"])
const KEYS = [
  "product",
  "stage",
  "statusLabel",
  "waitingFor",
  "customerActionRequired",
  "businessName",
  "locations",
  "completed",
  "nextStep",
  "receivedAt",
  "updatedAt",
] as const

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max) return null
  if (/cus_|sub_|si_|amount_minor|provider_|token_hash|stripe/i.test(trimmed)) return null
  return trimmed
}

function stamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return value
}

export function parseOnboardingStatus(value: unknown): { requests: OnboardingRequestView[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => key !== "requests")) return null
  if (!Array.isArray(record.requests) || record.requests.length > 50) return null
  const serialised = JSON.stringify(record)
  if (/cus_|sub_|si_|amount_minor|provider_|token_hash|stripe/i.test(serialised)) return null
  const requests: OnboardingRequestView[] = []
  for (const entry of record.requests) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
    const row = entry as Record<string, unknown>
    if (Object.keys(row).some(key => !KEYS.includes(key as (typeof KEYS)[number]))) return null
    const product = text(row.product, 20)
    const stage = typeof row.stage === "string" ? row.stage : ""
    const statusLabel = text(row.statusLabel, 80)
    const nextStep = text(row.nextStep, 300)
    const receivedAt = stamp(row.receivedAt)
    const updatedAt = stamp(row.updatedAt)
    if (!product || !PRODUCTS.has(product) || !STAGES.has(stage) || !statusLabel || !nextStep || !receivedAt || !updatedAt) return null
    if (row.waitingFor !== "us" && row.waitingFor !== "you") return null
    if (typeof row.customerActionRequired !== "boolean") return null
    const businessName = row.businessName == null ? null : text(row.businessName, 200)
    if (row.businessName != null && !businessName) return null
    let locations: string[] | null
    if (row.locations == null) locations = null
    else if (!Array.isArray(row.locations) || row.locations.length > 20) return null
    else {
      locations = []
      for (const location of row.locations) {
        const name = text(location, 200)
        if (!name) return null
        locations.push(name)
      }
    }
    if (!Array.isArray(row.completed) || row.completed.length > 12) return null
    const completed: string[] = []
    for (const item of row.completed) {
      const step = text(item, 80)
      if (!step) return null
      completed.push(step)
    }
    requests.push({
      product: product as OnboardingProductName,
      stage: stage as OnboardingStage,
      statusLabel,
      waitingFor: row.waitingFor,
      customerActionRequired: row.customerActionRequired,
      businessName,
      locations,
      completed,
      nextStep,
      receivedAt,
      updatedAt,
    })
  }
  return { requests }
}
