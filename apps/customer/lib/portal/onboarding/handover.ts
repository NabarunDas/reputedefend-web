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

export type ServicePreferenceLocation = {
  locationId: string
  locationName: string
  status: "needed" | "recorded"
  timezone: string | null
  hoursSummary: string | null
  greeting: string | null
  callbackInstructions: string | null
  spokenLanguage: string | null
  additionalLanguages: string[]
  voicePresentation: string | null
  accent: string | null
  customerConfirmedAt: string | null
  recordedBy: string | null
  note: string | null
}

export type ServicePreferences = {
  state: "needed" | "partial" | "complete"
  confirmedCount: number
  locationCount: number
  locations: ServicePreferenceLocation[]
}

export type ServiceConfigurationLocation = {
  locationId: string
  locationName: string
  status: "needed" | "review" | "recorded"
  note: string
}

export type ServiceConfiguration = {
  state: "needed" | "partial" | "review" | "recorded"
  recordedCount: number
  locationCount: number
  locations: ServiceConfigurationLocation[]
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
    assignment: "pending_confirmation" | "recorded" | "not_applicable"
    locations: HandoverLocation[]
  }
  financialStatus: "awaiting_payment" | "verified" | "unverified"
  paymentScope: "initial_settlement" | null
  periodStart: string | null
  periodEnd: string | null
  operationalStatus: "not_started" | "setup_started" | "awaiting_verification" | "active"
  customerDisplay: string
  message: string | null
  paymentConfirmedAt: string | null
  checklist: HandoverChecklistStep[]
  servicePreferences: ServicePreferences | null
  serviceConfiguration: ServiceConfiguration | null
}

const stepKeys = ["payment", "preferences", "agent", "number", "test", "activation"] as const
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const forbidden = /cus_|evt_|cs_|price_|prod_|si_/

function instant(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) return undefined
  return value
}

function preferenceLocation(value: unknown): ServicePreferenceLocation | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const hidden = ["communicationId", "messageId", "attestation", "requestId", "actorId", "voiceId", "providerVoiceId", "staffNote"]
  if (hidden.some(key => key in row)) return null
  if (typeof row.locationId !== "string" || !uuid.test(row.locationId)) return null
  if (typeof row.locationName !== "string" || row.locationName.trim().length === 0) return null
  if (row.status !== "needed" && row.status !== "recorded") return null
  if (row.status === "needed") {
    return {
      locationId: row.locationId,
      locationName: row.locationName,
      status: "needed",
      timezone: null,
      hoursSummary: null,
      greeting: null,
      callbackInstructions: null,
      spokenLanguage: null,
      additionalLanguages: [],
      voicePresentation: null,
      accent: null,
      customerConfirmedAt: null,
      recordedBy: null,
      note: null,
    }
  }
  if (typeof row.timezone !== "string" || typeof row.hoursSummary !== "string" || typeof row.greeting !== "string") return null
  if (typeof row.callbackInstructions !== "string" || typeof row.spokenLanguage !== "string") return null
  if (typeof row.voicePresentation !== "string" || typeof row.accent !== "string" || typeof row.note !== "string") return null
  if (row.recordedBy !== "Your setup team") return null
  if (typeof row.customerConfirmedAt !== "string" || Number.isNaN(new Date(row.customerConfirmedAt).getTime())) return null
  if (!Array.isArray(row.additionalLanguages) || row.additionalLanguages.some(language => typeof language !== "string")) return null
  return {
    locationId: row.locationId,
    locationName: row.locationName,
    status: "recorded",
    timezone: row.timezone,
    hoursSummary: row.hoursSummary,
    greeting: row.greeting,
    callbackInstructions: row.callbackInstructions,
    spokenLanguage: row.spokenLanguage,
    additionalLanguages: row.additionalLanguages,
    voicePresentation: row.voicePresentation,
    accent: row.accent,
    customerConfirmedAt: row.customerConfirmedAt,
    recordedBy: row.recordedBy,
    note: row.note,
  }
}

function servicePreferences(value: unknown): ServicePreferences | null | undefined {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  if (row.state !== "needed" && row.state !== "partial" && row.state !== "complete") return undefined
  if (typeof row.confirmedCount !== "number" || typeof row.locationCount !== "number") return undefined
  if (!Array.isArray(row.locations)) return undefined
  const locations = row.locations.map(preferenceLocation)
  if (locations.some(location => location === null)) return undefined
  return {
    state: row.state,
    confirmedCount: row.confirmedCount,
    locationCount: row.locationCount,
    locations: locations as ServicePreferenceLocation[],
  }
}

function serviceConfiguration(value: unknown): ServiceConfiguration | null | undefined {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  if (row.state !== "needed" && row.state !== "partial" && row.state !== "review" && row.state !== "recorded") return undefined
  if (typeof row.recordedCount !== "number" || typeof row.locationCount !== "number") return undefined
  if (!Array.isArray(row.locations)) return undefined
  const hidden = ["agentRef", "attestation", "fingerprint", "configurationFingerprint", "providerRevision", "voiceIdentifier", "chosenVoice", "chosenLanguage", "requestId", "actorId", "provider", "environment", "verificationBasis"]
  const locations: ServiceConfigurationLocation[] = []
  for (const entry of row.locations) {
    if (!entry || typeof entry !== "object") return undefined
    const location = entry as Record<string, unknown>
    if (hidden.some(key => key in location)) return undefined
    if (typeof location.locationId !== "string" || !uuid.test(location.locationId)) return undefined
    if (typeof location.locationName !== "string" || location.locationName.trim().length === 0) return undefined
    if (location.status !== "needed" && location.status !== "review" && location.status !== "recorded") return undefined
    if (typeof location.note !== "string" || location.note.trim().length === 0) return undefined
    locations.push({
      locationId: location.locationId,
      locationName: location.locationName,
      status: location.status,
      note: location.note,
    })
  }
  return {
    state: row.state,
    recordedCount: row.recordedCount,
    locationCount: row.locationCount,
    locations,
  }
}

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
    if (guard.assignment !== "pending_confirmation" && guard.assignment !== "recorded" && guard.assignment !== "not_applicable") return null
    if (!Array.isArray(guard.locations)) return null
    const guardLocations = guard.locations.map(location)
    if (guardLocations.some(item => item === null)) return null
    if (guard.included) {
      if (guard.quantity < 1) return null
      if (guard.assignment === "pending_confirmation" && guardLocations.length !== 0) return null
      if (guard.assignment === "recorded" && guardLocations.length < 1) return null
      if (guard.assignment === "not_applicable") return null
    } else if (guard.assignment !== "not_applicable" || guard.quantity !== 0 || guardLocations.length !== 0) {
      return null
    }
    if (row.financialStatus !== "awaiting_payment" && row.financialStatus !== "verified" && row.financialStatus !== "unverified") return null
    const periodStart = instant(row.periodStart)
    const periodEnd = instant(row.periodEnd)
    if (periodStart === undefined || periodEnd === undefined) return null
    if (row.financialStatus === "verified") {
      if (row.paymentScope !== "initial_settlement" || periodStart === null || periodEnd === null) return null
      if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) return null
    } else if (row.paymentScope !== null || periodStart !== null || periodEnd !== null) {
      return null
    }
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
    const preferences = servicePreferences(row.servicePreferences)
    if (preferences === undefined) return null
    const configuration = serviceConfiguration(row.serviceConfiguration)
    if (configuration === undefined) return null
    if ("configurationProgress" in row || "preferenceProgress" in row || "agentRef" in row) return null
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
        assignment: guard.assignment,
        locations: guardLocations as HandoverLocation[],
      },
      financialStatus: row.financialStatus,
      paymentScope: row.financialStatus === "verified" ? "initial_settlement" : null,
      periodStart: row.financialStatus === "verified" ? periodStart : null,
      periodEnd: row.financialStatus === "verified" ? periodEnd : null,
      operationalStatus: row.operationalStatus,
      customerDisplay: row.customerDisplay,
      message: row.message,
      paymentConfirmedAt: row.paymentConfirmedAt,
      checklist,
      servicePreferences: preferences,
      serviceConfiguration: configuration,
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
