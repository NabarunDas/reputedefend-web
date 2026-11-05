import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialConfirmPreferencesEnabled } from "./confirm-preferences-flag"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

type Hours = {
  day: (typeof week)[number]
  closed: boolean
  opens: string | null
  closes: string | null
  breaks: { starts: string; ends: string }[]
}

type PreferencePayload = {
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  locationId: string
  preferenceVersion: number
  preferences: {
    timezone: string
    openingHours: Hours[]
    exceptionalHours: string
    outOfHours: string
    greeting: string
    enquiryDetails: string[]
    callbackInstructions: string
    callbackWindows: { day: (typeof week)[number]; starts: string; ends: string }[]
    urgentRules: string
    directContactRules: string
    specialInstructions: string | null
    voicePresentation: "female" | "male" | "no_preference"
    accent: string
    spokenLanguage: string
    additionalLanguages: string[]
    pronunciationNotes: string | null
  }
  confirmation: {
    source: "recorded_email" | "recorded_message" | "telephone"
    communicationId: string | null
    messageId: string | null
    attestation: string | null
    customerConfirmedAt: string
  }
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) return null
  return trimmed
}

function optionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === null) return null
  return text(value, 1, maximum)
}

function clock(value: unknown): string | null {
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value) ? value : null
}

function hours(value: unknown): Hours[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null
  const seen = new Set<string>()
  const days: Hours[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null
    const row = entry as Record<string, unknown>
    if (!week.includes(row.day as (typeof week)[number]) || seen.has(String(row.day))) return null
    if (typeof row.closed !== "boolean" || !Array.isArray(row.breaks) || row.breaks.length > 3) return null
    seen.add(String(row.day))
    const breaks: Hours["breaks"] = []
    for (const item of row.breaks) {
      if (!item || typeof item !== "object") return null
      const period = item as Record<string, unknown>
      const starts = clock(period.starts)
      const ends = clock(period.ends)
      if (!starts || !ends || ends <= starts) return null
      breaks.push({ starts, ends })
    }
    if (row.closed) {
      if (row.opens !== null || row.closes !== null || breaks.length !== 0) return null
      days.push({ day: row.day as Hours["day"], closed: true, opens: null, closes: null, breaks: [] })
    } else {
      const opens = clock(row.opens)
      const closes = clock(row.closes)
      if (!opens || !closes || opens === closes) return null
      days.push({ day: row.day as Hours["day"], closed: false, opens, closes, breaks })
    }
  }
  return seen.size === 7 ? days : null
}

function payload(value: unknown): { subscriptionId: string; version: number; payload: PreferencePayload } | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  if (typeof body.customerId !== "string" || !isUuid(body.customerId)) return null
  if (typeof body.businessId !== "string" || !isUuid(body.businessId)) return null
  if (typeof body.onboardingRequestId !== "string" || !isUuid(body.onboardingRequestId)) return null
  if (typeof body.onboardingVersion !== "number" || !Number.isInteger(body.onboardingVersion) || body.onboardingVersion < 1) return null
  if (typeof body.locationId !== "string" || !isUuid(body.locationId)) return null
  if (typeof body.preferenceVersion !== "number" || !Number.isInteger(body.preferenceVersion) || body.preferenceVersion < 0) return null
  if (!body.preferences || typeof body.preferences !== "object" || !body.confirmation || typeof body.confirmation !== "object") return null
  const preferences = body.preferences as Record<string, unknown>
  const confirmation = body.confirmation as Record<string, unknown>
  const openingHours = hours(preferences.openingHours)
  const timezone = text(preferences.timezone, 3, 80)
  const exceptionalHours = text(preferences.exceptionalHours, 10, 400)
  const outOfHours = text(preferences.outOfHours, 10, 800)
  const greeting = text(preferences.greeting, 10, 400)
  const callbackInstructions = text(preferences.callbackInstructions, 10, 800)
  const urgentRules = text(preferences.urgentRules, 10, 800)
  const directContactRules = text(preferences.directContactRules, 10, 800)
  const accent = text(preferences.accent, 2, 40)
  const spokenLanguage = text(preferences.spokenLanguage, 2, 5)
  const specialInstructions = optionalText(preferences.specialInstructions, 1000)
  const pronunciationNotes = optionalText(preferences.pronunciationNotes, 400)
  if (!openingHours || !timezone || !timezone.includes("/") || !exceptionalHours || !outOfHours || !greeting) return null
  if (!callbackInstructions || !urgentRules || !directContactRules || !accent || !spokenLanguage) return null
  if (specialInstructions === undefined || pronunciationNotes === undefined) return null
  if (preferences.voicePresentation !== "female" && preferences.voicePresentation !== "male" && preferences.voicePresentation !== "no_preference") return null
  if (!Array.isArray(preferences.enquiryDetails) || preferences.enquiryDetails.length < 1 || preferences.enquiryDetails.length > 8) return null
  const enquiryDetails = preferences.enquiryDetails.map(item => text(item, 3, 80))
  if (enquiryDetails.some(item => item === null)) return null
  if (!Array.isArray(preferences.callbackWindows) || preferences.callbackWindows.length > 14) return null
  const callbackWindows: PreferencePayload["preferences"]["callbackWindows"] = []
  for (const item of preferences.callbackWindows) {
    if (!item || typeof item !== "object") return null
    const window = item as Record<string, unknown>
    const starts = clock(window.starts)
    const ends = clock(window.ends)
    if (!week.includes(window.day as (typeof week)[number]) || !starts || !ends || ends <= starts) return null
    callbackWindows.push({ day: window.day as (typeof week)[number], starts, ends })
  }
  if (!Array.isArray(preferences.additionalLanguages) || preferences.additionalLanguages.length > 4) return null
  const additionalLanguages = preferences.additionalLanguages.map(item => text(item, 2, 5))
  if (additionalLanguages.some(item => item === null)) return null
  if (confirmation.source !== "recorded_email" && confirmation.source !== "recorded_message" && confirmation.source !== "telephone") return null
  if (typeof confirmation.customerConfirmedAt !== "string" || Number.isNaN(new Date(confirmation.customerConfirmedAt).getTime())) return null
  const communicationId = confirmation.communicationId === null ? null : typeof confirmation.communicationId === "string" && isUuid(confirmation.communicationId) ? confirmation.communicationId : undefined
  const messageId = confirmation.messageId === null ? null : typeof confirmation.messageId === "string" && isUuid(confirmation.messageId) ? confirmation.messageId : undefined
  const attestation = confirmation.attestation === null ? null : text(confirmation.attestation, 20, 500)
  if (communicationId === undefined || messageId === undefined || attestation === undefined) return null
  if (attestation === null) return null
  if (confirmation.source === "telephone" && (communicationId !== null || messageId !== null)) return null
  if (confirmation.source === "recorded_email" && (communicationId === null || messageId !== null)) return null
  if (confirmation.source === "recorded_message" && (messageId === null || communicationId !== null)) return null
  return {
    subscriptionId: body.subscriptionId,
    version: body.version,
    payload: {
      customerId: body.customerId,
      businessId: body.businessId,
      onboardingRequestId: body.onboardingRequestId,
      onboardingVersion: body.onboardingVersion,
      locationId: body.locationId,
      preferenceVersion: body.preferenceVersion,
      preferences: {
        timezone,
        openingHours,
        exceptionalHours,
        outOfHours,
        greeting,
        enquiryDetails: enquiryDetails as string[],
        callbackInstructions,
        callbackWindows,
        urgentRules,
        directContactRules,
        specialInstructions,
        voicePresentation: preferences.voicePresentation,
        accent,
        spokenLanguage,
        additionalLanguages: additionalLanguages as string[],
        pronunciationNotes,
      },
      confirmation: {
        source: confirmation.source,
        communicationId,
        messageId,
        attestation,
        customerConfirmedAt: confirmation.customerConfirmedAt,
      },
    },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "setup") return "Setup has not started for this subscription, so preferences cannot be confirmed."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so preferences cannot be confirmed."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so preferences cannot be confirmed."
  if (reason === "inactive") return "This subscription is not active, so preferences cannot be confirmed."
  if (reason === "expired") return "This subscription period has ended, so preferences cannot be confirmed."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so preferences cannot be confirmed."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  if (reason === "provenance") return "That email or message does not verify this customer, business, and location. Record a staff attestation only for evidence that does."
  if (reason === "live") return "This location is already live, so preferences cannot be changed here."
  return "Preferences cannot be confirmed for this subscription."
}

export async function confirmPreferencesCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialConfirmPreferencesEnabled()) {
    return reply("Confirm business preferences is not switched on.", 403)
  }
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the preferences and try again.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the preferences before confirming them.", 400)
    const result = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_confirm_preferences_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: command.payload,
    })
    switch (result.status) {
      case "success": return reply("Business preferences are recorded for this location. The queue shows what is still needed.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("These preferences have changed. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the preferences before confirming them.", 400)
      default: return reply("We couldn’t record the preferences. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t record the preferences. Reload the queue before trying again.", 503)
  }
}
