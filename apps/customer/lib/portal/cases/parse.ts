/**
 * Strict reader for the customer dashboard and cases RPCs.
 * Unexpected shapes fail closed. This module does not render enums.
 */

export const CASE_TYPES = ["PROFILE_RECOVERY", "REVIEW_PROTECTION"] as const
export const SERVICE_TRACKS = ["UNDECIDED", "GUIDED", "MANAGED"] as const
export const CASE_STATUSES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "AWAITING_CUSTOMER",
  "RECOMMENDATION_READY",
  "CLOSED",
  "CANCELLED",
] as const
export const WORK_STAGES = [
  "INITIAL_REVIEW",
  "EVIDENCE_COLLECTION",
  "ASSESSMENT_READY",
  "SERVICE_SELECTION",
  "PAYMENT_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "PREPARATION",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "WAITING_GOOGLE",
  "OWNER_ACTION",
  "FURTHER_REVIEW",
  "OUTCOME_REVIEW",
  "FINISHED",
] as const
export const ATTENTION_CODES = [
  "EVIDENCE_REQUIRED",
  "QUOTE_ACCEPTANCE",
  "SERVICE_AGREEMENT",
  "CASE_PERMISSION",
  "GUIDED_PAYMENT",
  "MANAGED_PAYMENT_SETUP",
  "PAYMENT_RECOVERY",
  "INVOICE_PAYMENT",
] as const

export type CaseType = (typeof CASE_TYPES)[number]
export type ServiceTrack = (typeof SERVICE_TRACKS)[number]
export type CaseStatus = (typeof CASE_STATUSES)[number]
export type WorkStage = (typeof WORK_STAGES)[number]
export type AttentionCode = (typeof ATTENTION_CODES)[number]
export type CasesView = "active" | "previous" | "all"

const PUBLIC_REF = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const CASE_KEYS = [
  "reference",
  "caseType",
  "serviceTrack",
  "businessName",
  "locationName",
  "status",
  "workStage",
  "submittedAt",
  "closedAt",
  "attentionItems",
] as const

export type AttentionItem =
  | { code: "EVIDENCE_REQUIRED"; dueAt: string | null }
  | {
      code: Exclude<AttentionCode, "EVIDENCE_REQUIRED">
      expiresAt: string
    }

export type CustomerCaseRow = {
  reference: string
  caseType: CaseType
  serviceTrack: ServiceTrack
  businessName: string
  locationName: string | null
  status: CaseStatus
  workStage: WorkStage
  submittedAt: string
  closedAt: string | null
  attentionItems: AttentionItem[]
}

export type CustomerDashboard = {
  summary: {
    activeCases: number
    attentionCases: number
    previousCases: number
  }
  attentionCases: CustomerCaseRow[]
  recentCases: CustomerCaseRow[]
}

export type CustomerCasePage = {
  cases: CustomerCaseRow[]
  nextCursor: { submittedAt: string; reference: string } | null
}

export type CasesQuery = {
  view: CasesView
  before: string | null
  reference: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every(key => actual.includes(key))
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_TIME.test(value) || Number.isNaN(Date.parse(value))) return null
  return value
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null
}

function attentionItem(value: unknown): AttentionItem | null {
  const row = record(value)
  if (!row) return null
  const code = oneOf(row.code, ATTENTION_CODES)
  if (!code) return null
  if (code === "EVIDENCE_REQUIRED") {
    const keys = Object.keys(row)
    if (keys.some(key => key !== "code" && key !== "dueAt")) return null
    if ("dueAt" in row && row.dueAt !== null) {
      const dueAt = timestamp(row.dueAt)
      if (!dueAt) return null
      return { code, dueAt }
    }
    return { code, dueAt: null }
  }
  if (!sameKeys(row, ["code", "expiresAt"])) return null
  const expiresAt = timestamp(row.expiresAt)
  if (!expiresAt) return null
  return { code, expiresAt }
}

export function parseCaseRow(value: unknown): CustomerCaseRow | null {
  const row = record(value)
  if (!row || !sameKeys(row, CASE_KEYS)) return null
  const reference = text(row.reference)
  const caseType = oneOf(row.caseType, CASE_TYPES)
  const serviceTrack = oneOf(row.serviceTrack, SERVICE_TRACKS)
  const businessName = text(row.businessName)
  const status = oneOf(row.status, CASE_STATUSES)
  const workStage = oneOf(row.workStage, WORK_STAGES)
  const submittedAt = timestamp(row.submittedAt)
  if (!reference || !PUBLIC_REF.test(reference) || !caseType || !serviceTrack || !businessName || !status || !workStage || !submittedAt) {
    return null
  }
  if ((caseType === "PROFILE_RECOVERY" && !reference.startsWith("PR-")) || (caseType === "REVIEW_PROTECTION" && !reference.startsWith("RV-"))) {
    return null
  }
  let locationName: string | null = null
  if (row.locationName !== null) {
    locationName = text(row.locationName)
    if (!locationName) return null
  }
  let closedAt: string | null = null
  if (row.closedAt !== null) {
    closedAt = timestamp(row.closedAt)
    if (!closedAt) return null
  }
  if (!Array.isArray(row.attentionItems) || row.attentionItems.length > 20) return null
  const attentionItems: AttentionItem[] = []
  for (const item of row.attentionItems) {
    const parsed = attentionItem(item)
    if (!parsed) return null
    attentionItems.push(parsed)
  }
  return { reference, caseType, serviceTrack, businessName, locationName, status, workStage, submittedAt, closedAt, attentionItems }
}

function parseCases(value: unknown, limit: number): CustomerCaseRow[] | null {
  if (!Array.isArray(value) || value.length > limit) return null
  const cases: CustomerCaseRow[] = []
  for (const item of value) {
    const parsed = parseCaseRow(item)
    if (!parsed) return null
    cases.push(parsed)
  }
  return cases
}

export function parseDashboard(value: unknown): CustomerDashboard | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["summary", "attentionCases", "recentCases"])) return null
  const summary = record(row.summary)
  if (!summary || !sameKeys(summary, ["activeCases", "attentionCases", "previousCases"])) return null
  const activeCases = count(summary.activeCases)
  const attentionCases = count(summary.attentionCases)
  const previousCases = count(summary.previousCases)
  if (activeCases === null || attentionCases === null || previousCases === null) return null
  const attention = parseCases(row.attentionCases, 5)
  const recent = parseCases(row.recentCases, 3)
  if (!attention || !recent) return null
  if (attention.length > attentionCases || (attentionCases > 0 && attention.length === 0)) return null
  const owned = activeCases + previousCases
  if (recent.length > owned || (owned > 0 && recent.length === 0)) return null
  return { summary: { activeCases, attentionCases, previousCases }, attentionCases: attention, recentCases: recent }
}

export function parseCasePage(value: unknown): CustomerCasePage | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["cases", "nextCursor"])) return null
  const cases = parseCases(row.cases, 20)
  if (!cases) return null
  if (row.nextCursor === null) return { cases, nextCursor: null }
  const cursor = record(row.nextCursor)
  if (!cursor || !sameKeys(cursor, ["submittedAt", "reference"])) return null
  const submittedAt = timestamp(cursor.submittedAt)
  const reference = text(cursor.reference)
  if (!submittedAt || !reference || !PUBLIC_REF.test(reference)) return null
  return { cases, nextCursor: { submittedAt, reference } }
}

export function parseCasesRequest(params: Record<string, string | string[] | undefined>): CasesQuery | null {
  const viewRaw = params.view
  const beforeRaw = params.before
  const refRaw = params.ref
  if (Array.isArray(viewRaw) || Array.isArray(beforeRaw) || Array.isArray(refRaw)) return null
  let view: CasesView = "active"
  if (viewRaw !== undefined) {
    if (viewRaw !== "active" && viewRaw !== "previous" && viewRaw !== "all") return null
    view = viewRaw
  }
  if ((beforeRaw === undefined) !== (refRaw === undefined)) return null
  if (beforeRaw === undefined || refRaw === undefined) return { view, before: null, reference: null }
  if (!ISO_TIME.test(beforeRaw) || Number.isNaN(Date.parse(beforeRaw)) || !PUBLIC_REF.test(refRaw)) return null
  // Keep the original timestamp. Date conversion drops microseconds and would
  // repeat the cursor row on the next page.
  return { view, before: beforeRaw, reference: refRaw }
}
