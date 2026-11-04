import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import { commercialSetupHandoverReadEnabled } from "./flag"

export type HandoverChecklistStep = {
  key: "payment" | "preferences" | "agent" | "number" | "test" | "activation"
  label: string
  state: "complete" | "planned"
}

export type HandoverLocation = {
  locationId: string
  locationName: string
}

export type HandoverSubscription = {
  reference: string
  businessName: string
  product: "Telloya" | "Complete"
  locations: HandoverLocation[]
  guard: {
    included: boolean
    status: "pending_setup" | "not_subscribed"
    quantity: number
    monitoringActive: false
    locations: HandoverLocation[]
  }
  financialStatus: "awaiting_payment" | "verified" | "unverified"
  operationalStatus: "not_started" | "setup_started" | "awaiting_verification" | "active"
  customerDisplay: string
  message: string | null
  paymentConfirmedAt: string | null
  checklist: HandoverChecklistStep[]
}

const stepKeys = ["payment", "preferences", "agent", "number", "test", "activation"] as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const forbidden = /cus_|evt_|cs_|price_|prod_|si_/

function location(value: unknown): HandoverLocation | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.locationId !== "string" || !uuid.test(row.locationId)) return null
  if (typeof row.locationName !== "string" || row.locationName.trim().length === 0) return null
  return { locationId: row.locationId, locationName: row.locationName }
}

export function parseSetupHandover(value: unknown): HandoverSubscription[] | null {
  if (!value || typeof value !== "object") return null
  const text = JSON.stringify(value)
  if (text.includes("businessId") || forbidden.test(text)) return null
  const body = value as Record<string, unknown>
  if (!Array.isArray(body.subscriptions)) return null
  const subscriptions: HandoverSubscription[] = []
  for (const entry of body.subscriptions) {
    if (!entry || typeof entry !== "object") return null
    const row = entry as Record<string, unknown>
    if (typeof row.reference !== "string" || !/^VC-\d{2}-[A-HJ-NP-Z2-9]{6}$/.test(row.reference)) return null
    if (typeof row.businessName !== "string" || row.businessName.trim().length === 0) return null
    if (row.product !== "Telloya" && row.product !== "Complete") return null
    if (!Array.isArray(row.locations)) return null
    const locations = row.locations.map(location)
    if (locations.some(item => item === null)) return null
    if (!row.guard || typeof row.guard !== "object") return null
    const guard = row.guard as Record<string, unknown>
    if (typeof guard.included !== "boolean" || guard.monitoringActive !== false) return null
    if (guard.status !== "pending_setup" && guard.status !== "not_subscribed") return null
    if (typeof guard.quantity !== "number" || !Number.isInteger(guard.quantity) || guard.quantity < 0) return null
    if (!Array.isArray(guard.locations)) return null
    const guardLocations = guard.locations.map(location)
    if (guardLocations.some(item => item === null)) return null
    if (row.financialStatus !== "awaiting_payment" && row.financialStatus !== "verified" && row.financialStatus !== "unverified") return null
    if (row.operationalStatus !== "not_started" && row.operationalStatus !== "setup_started" && row.operationalStatus !== "awaiting_verification" && row.operationalStatus !== "active") return null
    if (typeof row.customerDisplay !== "string") return null
    if (row.message !== null && typeof row.message !== "string") return null
    if (row.paymentConfirmedAt !== null && (typeof row.paymentConfirmedAt !== "string" || Number.isNaN(new Date(row.paymentConfirmedAt).getTime()))) return null
    if (!Array.isArray(row.checklist) || row.checklist.length !== stepKeys.length) return null
    const checklist: HandoverChecklistStep[] = []
    for (let index = 0; index < stepKeys.length; index += 1) {
      const step = row.checklist[index] as Record<string, unknown>
      if (!step || step.key !== stepKeys[index] || typeof step.label !== "string") return null
      if (step.state !== "complete" && step.state !== "planned") return null
      checklist.push({ key: stepKeys[index], label: step.label, state: step.state })
    }
    subscriptions.push({
      reference: row.reference,
      businessName: row.businessName,
      product: row.product,
      locations: locations as HandoverLocation[],
      guard: {
        included: guard.included,
        status: guard.status,
        quantity: guard.quantity,
        monitoringActive: false,
        locations: guardLocations as HandoverLocation[],
      },
      financialStatus: row.financialStatus,
      operationalStatus: row.operationalStatus,
      customerDisplay: row.customerDisplay,
      message: row.message,
      paymentConfirmedAt: row.paymentConfirmedAt,
      checklist,
    })
  }
  return subscriptions
}

export type HandoverRead =
  | { status: "unauthenticated" }
  | { status: "unavailable" }
  | { status: "ready"; subscriptions: HandoverSubscription[] }

export async function loadSetupHandover(): Promise<HandoverRead> {
  if (!commercialSetupHandoverReadEnabled()) return { status: "unavailable" }
  const token = (await cookies()).get(portalSessionCookieName())?.value
  if (!token || !validToken(token)) return { status: "unauthenticated" }
  try {
    const row = await backend().rpc<unknown>("customer_portal_setup_handover_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return { status: "unauthenticated" }
    const parsed = parseSetupHandover(row)
    if (!parsed) return { status: "unavailable" }
    return { status: "ready", subscriptions: parsed }
  } catch {
    return { status: "unavailable" }
  }
}
