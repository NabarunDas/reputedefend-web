/**
 * Where an action belongs, as a closed set of internal Admin routes.
 *
 * UX-2 will decide what a destination looks like. All this has to guarantee
 * is that following one cannot leave the Admin application. Every href is
 * built here from a literal path and, where an identifier is needed, from a
 * value that has been checked to be a UUID. Nothing from the database, a
 * provider or a request ever becomes a destination, so there is no shape an
 * open redirect could take.
 */

import { isUuid, recordPath } from "../records/model"

export const caseDestinationKinds = [
  "CASE",
  "CASE_EVIDENCE",
  "CASE_COMMUNICATIONS",
  "CASE_COMMERCIAL",
  "COMMERCIAL",
  "MONEY",
  "TASKS",
  "DOCUMENTS",
  "CONVERSATIONS",
  "COMPLAINTS",
  "CLIENT_RECORD",
  "BUSINESS_RECORD",
] as const

export type CaseDestinationKind = (typeof caseDestinationKinds)[number]

export type CaseDestination = {
  kind: CaseDestinationKind
  /** An internal Admin path. Always begins with a single `/`. */
  href: string
  /** What the operator is being sent to, in their own words. */
  label: string
}

const fixedDestinations: Partial<Record<CaseDestinationKind, { href: string; label: string }>> = {
  COMMERCIAL: { href: "/commercial", label: "Commercial" },
  MONEY: { href: "/money", label: "Money" },
  TASKS: { href: "/tasks", label: "Tasks" },
  DOCUMENTS: { href: "/documents", label: "Documents" },
  CONVERSATIONS: { href: "/conversations", label: "Conversations" },
  COMPLAINTS: { href: "/complaints", label: "Complaints" },
}

/**
 * A destination that needs no identifier. Returns `null` for a kind that
 * does, so a caller cannot accidentally produce a path with a hole in it.
 */
export function destination(kind: CaseDestinationKind): CaseDestination | null {
  const fixed = fixedDestinations[kind]
  return fixed ? { kind, href: fixed.href, label: fixed.label } : null
}

/**
 * A destination inside one case. `caseId` must be a UUID; anything else
 * returns `null` rather than being interpolated into a path.
 */
export function caseDestination(
  kind: "CASE" | "CASE_EVIDENCE" | "CASE_COMMUNICATIONS" | "CASE_COMMERCIAL",
  caseId: string,
): CaseDestination | null {
  if (!isUuid(caseId)) return null
  if (kind === "CASE") return { kind, href: `/cases/${caseId}`, label: "Case" }
  if (kind === "CASE_EVIDENCE") return { kind, href: `/cases/${caseId}/evidence`, label: "Evidence and documents" }
  if (kind === "CASE_COMMERCIAL") return { kind, href: `/cases/${caseId}/commercial`, label: "Commercial and money" }
  // Case communications live on the shared surface behind a case filter;
  // there is no `/cases/[id]/communications` route in this build.
  return { kind, href: `/communications?case=${caseId}`, label: "Case communications" }
}

/** The client or business record behind the case, for verification work. */
export function recordDestination(kind: "CLIENT_RECORD" | "BUSINESS_RECORD", id: string | null): CaseDestination | null {
  if (!id || !isUuid(id)) return null
  if (kind === "CLIENT_RECORD") return { kind, href: recordPath("client", id), label: "Client record" }
  return { kind, href: recordPath("business", id), label: "Business record" }
}

/** Every path this module can produce is internal and single-rooted. */
export function isInternalPath(href: string): boolean {
  return /^\/(?!\/)[\w\-/[\]]*(\?[\w\-=&%]*)?$/.test(href)
}
