import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

export type SetupChecklistStep = {
  key: "payment" | "preferences" | "agent" | "number" | "test" | "activation"
  label: string
  state: "complete" | "planned"
}

export type SetupLocation = {
  locationId: string
  locationName: string
}

export type SetupQueueItem = {
  reference: string
  customerName: string
  businessId: string
  businessName: string
  product: "Telloya" | "Complete"
  plan: string
  monthlyPriceMinor: number
  currency: "GBP"
  locations: SetupLocation[]
  guardLocationCount: number
  guard: {
    included: boolean
    status: "pending_setup" | "not_subscribed"
    quantity: number
    monitoringActive: false
    locations: SetupLocation[]
  }
  financialStatus: "verified"
  operationalStatus: "not_started" | "setup_started" | "awaiting_verification"
  customerDisplay: string
  message: string | null
  paymentConfirmedAt: string
  nextAction: string
  checklist: SetupChecklistStep[]
}

const stepKeys = ["payment", "preferences", "agent", "number", "test", "activation"] as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function location(value: unknown): SetupLocation | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.locationId !== "string" || !uuid.test(row.locationId)) return null
  if (typeof row.locationName !== "string" || row.locationName.trim().length === 0) return null
  return { locationId: row.locationId, locationName: row.locationName }
}

function checklist(value: unknown): SetupChecklistStep[] | null {
  if (!Array.isArray(value) || value.length !== stepKeys.length) return null
  const steps: SetupChecklistStep[] = []
  for (let index = 0; index < stepKeys.length; index += 1) {
    const row = value[index]
    if (!row || typeof row !== "object") return null
    const step = row as Record<string, unknown>
    if (step.key !== stepKeys[index]) return null
    if (typeof step.label !== "string" || step.label.trim().length === 0) return null
    if (step.state !== "complete" && step.state !== "planned") return null
    steps.push({ key: stepKeys[index], label: step.label, state: step.state })
  }
  return steps
}

export function parseSetupQueue(value: unknown): SetupQueueItem[] | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (!Array.isArray(body.items)) return null
  const items: SetupQueueItem[] = []
  for (const entry of body.items) {
    if (!entry || typeof entry !== "object") return null
    const row = entry as Record<string, unknown>
    if (typeof row.reference !== "string" || !/^VC-\d{2}-[A-HJ-NP-Z2-9]{6}$/.test(row.reference)) return null
    if (typeof row.customerName !== "string" || row.customerName.trim().length === 0) return null
    if (typeof row.businessId !== "string" || !uuid.test(row.businessId)) return null
    if (typeof row.businessName !== "string" || row.businessName.trim().length === 0) return null
    if (row.product !== "Telloya" && row.product !== "Complete") return null
    if (typeof row.plan !== "string" || row.plan.trim().length === 0) return null
    if (typeof row.monthlyPriceMinor !== "number" || !Number.isInteger(row.monthlyPriceMinor) || row.monthlyPriceMinor <= 0) return null
    if (row.currency !== "GBP") return null
    if (!Array.isArray(row.locations)) return null
    const locations = row.locations.map(location)
    if (locations.some(item => item === null)) return null
    if (typeof row.guardLocationCount !== "number" || !Number.isInteger(row.guardLocationCount) || row.guardLocationCount < 0) return null
    if (!row.guard || typeof row.guard !== "object") return null
    const guard = row.guard as Record<string, unknown>
    if (typeof guard.included !== "boolean" || guard.monitoringActive !== false) return null
    if (guard.status !== "pending_setup" && guard.status !== "not_subscribed") return null
    if (guard.included !== (guard.status === "pending_setup")) return null
    if (typeof guard.quantity !== "number" || guard.quantity !== row.guardLocationCount) return null
    if (!Array.isArray(guard.locations)) return null
    const guardLocations = guard.locations.map(location)
    if (guardLocations.some(item => item === null)) return null
    if (row.financialStatus !== "verified") return null
    if (row.operationalStatus !== "not_started" && row.operationalStatus !== "setup_started" && row.operationalStatus !== "awaiting_verification") return null
    if (typeof row.customerDisplay !== "string" || row.customerDisplay.trim().length === 0) return null
    if (row.message !== null && typeof row.message !== "string") return null
    if (typeof row.paymentConfirmedAt !== "string" || Number.isNaN(new Date(row.paymentConfirmedAt).getTime())) return null
    if (typeof row.nextAction !== "string" || row.nextAction.trim().length === 0) return null
    const steps = checklist(row.checklist)
    if (!steps) return null
    if (JSON.stringify(row).includes("cus_") || JSON.stringify(row).includes("evt_")) return null
    items.push({
      reference: row.reference,
      customerName: row.customerName,
      businessId: row.businessId,
      businessName: row.businessName,
      product: row.product,
      plan: row.plan,
      monthlyPriceMinor: row.monthlyPriceMinor,
      currency: "GBP",
      locations: locations as SetupLocation[],
      guardLocationCount: row.guardLocationCount,
      guard: {
        included: guard.included,
        status: guard.status,
        quantity: guard.quantity,
        monitoringActive: false,
        locations: guardLocations as SetupLocation[],
      },
      financialStatus: "verified",
      operationalStatus: row.operationalStatus,
      customerDisplay: row.customerDisplay,
      message: row.message,
      paymentConfirmedAt: row.paymentConfirmedAt,
      nextAction: row.nextAction,
      checklist: steps,
    })
  }
  return items
}

export async function loadSetupQueue(): Promise<SetupQueueItem[] | null> {
  if (!commercialSetupQueueEnabled()) return null
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)?.value
  if (!token) redirect("/login")
  const result = await backend().rpc<unknown>("admin_commercial_setup_queue_v1", { p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return parseSetupQueue(result)
}
