import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import type { JourneySnapshot } from "./intake"
import type { JourneyWorkEvent } from "./decisions"

export type JourneyExtension = {
  snapshot: JourneySnapshot | null
  events: JourneyWorkEvent[]
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** The reviewed read. Missing until that database change is applied, in which case the page uses the records it already has. */
export function parseJourneyExtension(value: unknown): JourneyExtension | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if ("missing" in body) return null
  if (!Array.isArray(body.events)) return null
  const events: JourneyWorkEvent[] = []
  for (const row of body.events) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null
    const event = row as Record<string, unknown>
    if (typeof event.event !== "string" || typeof event.createdAt !== "string") return null
    if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) return null
    events.push({ event: event.event, createdAt: event.createdAt, details: event.details as Record<string, unknown> })
  }
  let snapshot: JourneySnapshot | null = null
  if (body.snapshot && typeof body.snapshot === "object" && !Array.isArray(body.snapshot)) {
    const raw = body.snapshot as Record<string, unknown>
    snapshot = {
      fullName: asText(raw.fullName),
      email: asText(raw.email),
      businessName: asText(raw.businessName),
      country: asText(raw.country),
      phone: asText(raw.phone),
      websiteUrl: asText(raw.websiteUrl),
      businessProfileUrl: asText(raw.businessProfileUrl),
      reviewUrl: asText(raw.reviewUrl),
      details: asText(raw.details),
    }
    if (!snapshot.businessName || !snapshot.details) snapshot = null
  }
  return { snapshot, events }
}

export async function loadJourneyExtension(caseId: string): Promise<JourneyExtension | null> {
  if (!isUuid(caseId)) return null
  try {
    await requireStaff()
    const token = (await cookies()).get(sessionCookie)?.value
    if (!validToken(token)) return null
    const result = await backend().rpc<unknown>("admin_case_journey_intake_v1", { p_token: tokenHash(token), p_case: caseId })
    return parseJourneyExtension(result)
  } catch {
    return null
  }
}
