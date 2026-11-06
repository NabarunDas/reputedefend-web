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

export type PreferenceLocationProgress = {
  locationId: string
  locationName: string
  confirmed: boolean
  version: number
}

export type PreferenceProgress = {
  confirmedCount: number
  locationCount: number
  locations: PreferenceLocationProgress[]
}

export type ConfigurationLocationProgress = {
  locationId: string
  locationName: string
  status: "needed" | "review" | "recorded"
  configurationVersion: number
  preferenceVersion: number
  provisionVersion: number
  timezone: string | null
  hoursSummary: string | null
  greeting: string | null
  exceptionalHours: string | null
  outOfHours: string | null
  callbackInstructions: string | null
  urgentRules: string | null
  directContactRules: string | null
  specialInstructions: string | null
  spokenLanguage: string | null
  additionalLanguages: string[] | null
  voicePresentation: string | null
  accent: string | null
  pronunciationNotes: string | null
  environment: "dev" | "production" | null
  agentRef: string | null
  providerRevision: string | null
  chosenVoice: string | null
  chosenLanguage: string | null
  verificationBasis: "OPERATOR_ATTESTED" | null
  attestation: string | null
}

export type ConfigurationProgress = {
  recordedCount: number
  reviewCount: number
  locationCount: number
  locations: ConfigurationLocationProgress[]
}

export type AllocationLocationProgress = {
  locationId: string
  locationName: string
  status: "needed" | "review" | "recorded"
  allocationVersion: number
  configurationVersion: number
  preferenceVersion: number
  provisionVersion: number
  environment: "dev" | "production" | null
  agentRef: string | null
  e164: string | null
  allocationRef: string | null
  verificationBasis: "OPERATOR_ATTESTED" | null
  attestation: string | null
  recordedAt: string | null
}

export type AllocationProgress = {
  recordedCount: number
  reviewCount: number
  locationCount: number
  locations: AllocationLocationProgress[]
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
    assignment: "pending_confirmation" | "recorded" | "not_applicable"
    locations: SetupLocation[]
  }
  financialStatus: "verified"
  paymentScope: "initial_settlement"
  periodStart: string
  periodEnd: string
  operationalStatus: "not_started" | "setup_started" | "awaiting_verification"
  customerDisplay: string
  message: string | null
  paymentConfirmedAt: string
  nextAction: string
  checklist: SetupChecklistStep[]
  subscriptionId: string | null
  subscriptionVersion: number | null
  customerId: string | null
  onboardingRequestId: string | null
  onboardingVersion: number | null
  setupStartedAt: string | null
  preferenceProgress: PreferenceProgress | null
  configurationProgress: ConfigurationProgress | null
  allocationProgress: AllocationProgress | null
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

function preferenceProgress(value: unknown): PreferenceProgress | null | undefined {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  if (typeof row.confirmedCount !== "number" || !Number.isInteger(row.confirmedCount) || row.confirmedCount < 0) return undefined
  if (typeof row.locationCount !== "number" || !Number.isInteger(row.locationCount) || row.locationCount < row.confirmedCount) return undefined
  if (!Array.isArray(row.locations) || row.locations.length !== row.locationCount) return undefined
  const locations: PreferenceLocationProgress[] = []
  for (const entry of row.locations) {
    if (!entry || typeof entry !== "object") return undefined
    const location = entry as Record<string, unknown>
    if (typeof location.locationId !== "string" || !uuid.test(location.locationId)) return undefined
    if (typeof location.locationName !== "string" || location.locationName.trim().length === 0) return undefined
    if (typeof location.confirmed !== "boolean") return undefined
    if (typeof location.version !== "number" || !Number.isInteger(location.version) || location.version < 0) return undefined
    locations.push({
      locationId: location.locationId,
      locationName: location.locationName,
      confirmed: location.confirmed,
      version: location.version,
    })
  }
  if (locations.filter(location => location.confirmed).length !== row.confirmedCount) return undefined
  return { confirmedCount: row.confirmedCount, locationCount: row.locationCount, locations }
}

function optionalText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return undefined
  return value
}

function optionalLanguages(value: unknown): string[] | null | undefined {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) return undefined
  return value
}

function configurationProgress(value: unknown): ConfigurationProgress | null | undefined {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  if (typeof row.recordedCount !== "number" || !Number.isInteger(row.recordedCount) || row.recordedCount < 0) return undefined
  if (typeof row.reviewCount !== "number" || !Number.isInteger(row.reviewCount) || row.reviewCount < 0) return undefined
  if (typeof row.locationCount !== "number" || !Number.isInteger(row.locationCount) || row.locationCount < 0) return undefined
  if (row.recordedCount + row.reviewCount > row.locationCount) return undefined
  if (!Array.isArray(row.locations) || row.locations.length !== row.locationCount) return undefined
  const locations: ConfigurationLocationProgress[] = []
  for (const entry of row.locations) {
    if (!entry || typeof entry !== "object") return undefined
    const location = entry as Record<string, unknown>
    if (typeof location.locationId !== "string" || !uuid.test(location.locationId)) return undefined
    if (typeof location.locationName !== "string" || location.locationName.trim().length === 0) return undefined
    if (location.status !== "needed" && location.status !== "review" && location.status !== "recorded") return undefined
    if (typeof location.configurationVersion !== "number" || !Number.isInteger(location.configurationVersion) || location.configurationVersion < 0) return undefined
    if (typeof location.preferenceVersion !== "number" || !Number.isInteger(location.preferenceVersion) || location.preferenceVersion < 0) return undefined
    if (typeof location.provisionVersion !== "number" || !Number.isInteger(location.provisionVersion) || location.provisionVersion < 0) return undefined
    const timezone = optionalText(location.timezone)
    const hoursSummary = optionalText(location.hoursSummary)
    const greeting = optionalText(location.greeting)
    const exceptionalHours = optionalText(location.exceptionalHours)
    const outOfHours = optionalText(location.outOfHours)
    const callbackInstructions = optionalText(location.callbackInstructions)
    const urgentRules = optionalText(location.urgentRules)
    const directContactRules = optionalText(location.directContactRules)
    const specialInstructions = optionalText(location.specialInstructions)
    const spokenLanguage = optionalText(location.spokenLanguage)
    const additionalLanguages = optionalLanguages(location.additionalLanguages)
    const accent = optionalText(location.accent)
    const pronunciationNotes = optionalText(location.pronunciationNotes)
    const agentRef = optionalText(location.agentRef)
    const providerRevision = optionalText(location.providerRevision)
    const chosenVoice = optionalText(location.chosenVoice)
    const chosenLanguage = optionalText(location.chosenLanguage)
    const attestation = optionalText(location.attestation)
    const voicePresentation = location.voicePresentation === null || location.voicePresentation === undefined
      ? null
      : location.voicePresentation === "female" || location.voicePresentation === "male" || location.voicePresentation === "no_preference"
        ? location.voicePresentation
        : undefined
    const environment = location.environment === null || location.environment === undefined
      ? null
      : location.environment === "dev" || location.environment === "production"
        ? location.environment
        : undefined
    const verificationBasis = location.verificationBasis === null || location.verificationBasis === undefined
      ? null
      : location.verificationBasis === "OPERATOR_ATTESTED"
        ? "OPERATOR_ATTESTED"
        : undefined
    if (
      timezone === undefined || hoursSummary === undefined || greeting === undefined || exceptionalHours === undefined
      || outOfHours === undefined || callbackInstructions === undefined || urgentRules === undefined
      || directContactRules === undefined || specialInstructions === undefined || spokenLanguage === undefined
      || additionalLanguages === undefined || accent === undefined || pronunciationNotes === undefined
      || agentRef === undefined || providerRevision === undefined || chosenVoice === undefined
      || chosenLanguage === undefined || attestation === undefined || voicePresentation === undefined
      || environment === undefined || verificationBasis === undefined
    ) return undefined
    if ((location.status === "recorded" || location.status === "review") && (agentRef === null || attestation === null || environment === null || verificationBasis === null)) return undefined
    locations.push({
      locationId: location.locationId,
      locationName: location.locationName,
      status: location.status,
      configurationVersion: location.configurationVersion,
      preferenceVersion: location.preferenceVersion,
      provisionVersion: location.provisionVersion,
      timezone,
      hoursSummary,
      greeting,
      exceptionalHours,
      outOfHours,
      callbackInstructions,
      urgentRules,
      directContactRules,
      specialInstructions,
      spokenLanguage,
      additionalLanguages,
      voicePresentation,
      accent,
      pronunciationNotes,
      environment,
      agentRef,
      providerRevision,
      chosenVoice,
      chosenLanguage,
      verificationBasis,
      attestation,
    })
  }
  if (locations.filter(location => location.status === "recorded").length !== row.recordedCount) return undefined
  if (locations.filter(location => location.status === "review").length !== row.reviewCount) return undefined
  return { recordedCount: row.recordedCount, reviewCount: row.reviewCount, locationCount: row.locationCount, locations }
}

function allocationProgress(value: unknown): AllocationProgress | null | undefined {
  if (value === undefined || value === null) return null
  if (!value || typeof value !== "object") return undefined
  const row = value as Record<string, unknown>
  if (typeof row.recordedCount !== "number" || !Number.isInteger(row.recordedCount) || row.recordedCount < 0) return undefined
  if (typeof row.reviewCount !== "number" || !Number.isInteger(row.reviewCount) || row.reviewCount < 0) return undefined
  if (typeof row.locationCount !== "number" || !Number.isInteger(row.locationCount) || row.locationCount < 0) return undefined
  if (row.recordedCount + row.reviewCount > row.locationCount) return undefined
  if (!Array.isArray(row.locations) || row.locations.length !== row.locationCount) return undefined
  const locations: AllocationLocationProgress[] = []
  for (const entry of row.locations) {
    if (!entry || typeof entry !== "object") return undefined
    const location = entry as Record<string, unknown>
    if (typeof location.locationId !== "string" || !uuid.test(location.locationId)) return undefined
    if (typeof location.locationName !== "string" || location.locationName.trim().length === 0) return undefined
    if (location.status !== "needed" && location.status !== "review" && location.status !== "recorded") return undefined
    if (typeof location.allocationVersion !== "number" || !Number.isInteger(location.allocationVersion) || location.allocationVersion < 0) return undefined
    if (typeof location.configurationVersion !== "number" || !Number.isInteger(location.configurationVersion) || location.configurationVersion < 0) return undefined
    if (typeof location.preferenceVersion !== "number" || !Number.isInteger(location.preferenceVersion) || location.preferenceVersion < 0) return undefined
    if (typeof location.provisionVersion !== "number" || !Number.isInteger(location.provisionVersion) || location.provisionVersion < 0) return undefined
    const environment = location.environment === null || location.environment === undefined
      ? null
      : location.environment === "dev" || location.environment === "production"
        ? location.environment
        : undefined
    const agentRef = optionalText(location.agentRef)
    const e164 = optionalText(location.e164)
    const allocationRef = optionalText(location.allocationRef)
    const attestation = optionalText(location.attestation)
    const recordedAt = location.recordedAt === null || location.recordedAt === undefined
      ? null
      : typeof location.recordedAt === "string" && !Number.isNaN(new Date(location.recordedAt).getTime())
        ? location.recordedAt
        : undefined
    const verificationBasis = location.verificationBasis === null || location.verificationBasis === undefined
      ? null
      : location.verificationBasis === "OPERATOR_ATTESTED"
        ? "OPERATOR_ATTESTED"
        : undefined
    if (environment === undefined || agentRef === undefined || e164 === undefined || allocationRef === undefined || attestation === undefined || recordedAt === undefined || verificationBasis === undefined) return undefined
    if (e164 !== null && !/^\+[1-9][0-9]{7,14}$/.test(e164)) return undefined
    if (location.status === "recorded" && (e164 === null || allocationRef === null || agentRef === null || environment === null || verificationBasis === null || attestation === null || recordedAt === null || location.allocationVersion < 1)) return undefined
    if (location.status === "needed" && (e164 !== null || allocationRef !== null || location.allocationVersion !== 0)) return undefined
    locations.push({
      locationId: location.locationId,
      locationName: location.locationName,
      status: location.status,
      allocationVersion: location.allocationVersion,
      configurationVersion: location.configurationVersion,
      preferenceVersion: location.preferenceVersion,
      provisionVersion: location.provisionVersion,
      environment,
      agentRef,
      e164,
      allocationRef,
      verificationBasis,
      attestation,
      recordedAt,
    })
  }
  if (locations.filter(location => location.status === "recorded").length !== row.recordedCount) return undefined
  if (locations.filter(location => location.status === "review").length !== row.reviewCount) return undefined
  return { recordedCount: row.recordedCount, reviewCount: row.reviewCount, locationCount: row.locationCount, locations }
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
    if (guard.assignment !== "pending_confirmation" && guard.assignment !== "recorded" && guard.assignment !== "not_applicable") return null
    if (!Array.isArray(guard.locations)) return null
    const guardLocations = guard.locations.map(location)
    if (guardLocations.some(item => item === null)) return null
    if (guard.included) {
      if (guard.assignment === "pending_confirmation" && guardLocations.length !== 0) return null
      if (guard.assignment === "recorded" && guardLocations.length < 1) return null
      if (guard.assignment === "not_applicable") return null
    } else if (guard.assignment !== "not_applicable" || guardLocations.length !== 0) {
      return null
    }
    if (row.financialStatus !== "verified" || row.paymentScope !== "initial_settlement") return null
    const periodStart = row.periodStart
    const periodEnd = row.periodEnd
    if (typeof periodStart !== "string" || Number.isNaN(new Date(periodStart).getTime())) return null
    if (typeof periodEnd !== "string" || Number.isNaN(new Date(periodEnd).getTime())) return null
    if (new Date(periodEnd).getTime() <= new Date(periodStart).getTime()) return null
    if (row.operationalStatus !== "not_started" && row.operationalStatus !== "setup_started" && row.operationalStatus !== "awaiting_verification") return null
    if (typeof row.customerDisplay !== "string" || row.customerDisplay.trim().length === 0) return null
    if (row.message !== null && typeof row.message !== "string") return null
    if (typeof row.paymentConfirmedAt !== "string" || Number.isNaN(new Date(row.paymentConfirmedAt).getTime())) return null
    if (typeof row.nextAction !== "string" || row.nextAction.trim().length === 0) return null
    const steps = checklist(row.checklist)
    if (!steps) return null
    const subscriptionId = row.subscriptionId === undefined || row.subscriptionId === null
      ? null
      : typeof row.subscriptionId === "string" && uuid.test(row.subscriptionId) ? row.subscriptionId : undefined
    const customerId = row.customerId === undefined || row.customerId === null
      ? null
      : typeof row.customerId === "string" && uuid.test(row.customerId) ? row.customerId : undefined
    const onboardingRequestId = row.onboardingRequestId === undefined || row.onboardingRequestId === null
      ? null
      : typeof row.onboardingRequestId === "string" && uuid.test(row.onboardingRequestId) ? row.onboardingRequestId : undefined
    const subscriptionVersion = row.subscriptionVersion === undefined || row.subscriptionVersion === null
      ? null
      : typeof row.subscriptionVersion === "number" && Number.isInteger(row.subscriptionVersion) && row.subscriptionVersion >= 1
        ? row.subscriptionVersion
        : undefined
    const onboardingVersion = row.onboardingVersion === undefined || row.onboardingVersion === null
      ? null
      : typeof row.onboardingVersion === "number" && Number.isInteger(row.onboardingVersion) && row.onboardingVersion >= 1
        ? row.onboardingVersion
        : undefined
    const setupStartedAt = row.setupStartedAt === undefined || row.setupStartedAt === null
      ? null
      : typeof row.setupStartedAt === "string" && !Number.isNaN(new Date(row.setupStartedAt).getTime())
        ? row.setupStartedAt
        : undefined
    const preferences = preferenceProgress(row.preferenceProgress)
    if (preferences === undefined) return null
    const configuration = configurationProgress(row.configurationProgress)
    if (configuration === undefined) return null
    const allocation = allocationProgress(row.allocationProgress)
    if (allocation === undefined) return null
    if (subscriptionId === undefined || customerId === undefined || onboardingRequestId === undefined || subscriptionVersion === undefined || onboardingVersion === undefined || setupStartedAt === undefined) return null
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
        assignment: guard.assignment,
        locations: guardLocations as SetupLocation[],
      },
      financialStatus: "verified",
      paymentScope: "initial_settlement",
      periodStart,
      periodEnd,
      operationalStatus: row.operationalStatus,
      customerDisplay: row.customerDisplay,
      message: row.message,
      paymentConfirmedAt: row.paymentConfirmedAt,
      nextAction: row.nextAction,
      checklist: steps,
      subscriptionId,
      subscriptionVersion,
      customerId,
      onboardingRequestId,
      onboardingVersion,
      setupStartedAt,
      preferenceProgress: preferences,
      configurationProgress: configuration,
      allocationProgress: allocation,
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
