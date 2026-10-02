/**
 * Narrowing for the batch CaseFlow fact projection.
 *
 * `admin_case_flow_facts_v1` returns `jsonb`, which arrives here as `unknown`.
 * This module turns that into `CaseFlowFacts` or refuses. It is deliberately
 * separate from `load.ts` and free of `server-only` so the refusals can be
 * tested directly, without a database and without a mocked Supabase client.
 *
 * The rule throughout is that a fact which cannot be read is an error, never a
 * default. A missing array does not become an empty array and a missing case
 * does not become an empty fact tree: either would make the resolver answer
 * confidently from nothing, which is the one failure mode a queue of fifty
 * cases must not have.
 */

import { isUuid } from "../records/model"
import type {
  CaseFlowCapabilityFact,
  CaseFlowFacts,
  CaseServiceTrack,
} from "./model"

/**
 * The most cases one projection call may ask for, matching the Cases page
 * size. The database enforces the same bound; this stops an oversized request
 * before it leaves the server.
 */
export const CASE_FLOW_BATCH_LIMIT = 50

export class CaseFlowProjectionError extends Error {
  constructor(message: string) {
    super(`case flow projection: ${message}`)
    this.name = "CaseFlowProjectionError"
  }
}

const fail = (message: string): never => {
  throw new CaseFlowProjectionError(message)
}

/**
 * Validates and deduplicates the requested identifiers, keeping first-seen
 * order so a caller can pair results back to its own rows.
 */
export function caseFlowBatchIds(caseIds: readonly string[]): string[] {
  if (!Array.isArray(caseIds)) fail("case identifiers must be an array")
  if (caseIds.length > CASE_FLOW_BATCH_LIMIT) {
    fail(`at most ${CASE_FLOW_BATCH_LIMIT} cases may be projected at once, asked for ${caseIds.length}`)
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const caseId of caseIds) {
    if (typeof caseId !== "string" || !isUuid(caseId)) fail(`${String(caseId)} is not a case identifier`)
    if (seen.has(caseId)) continue
    seen.add(caseId)
    unique.push(caseId)
  }
  return unique
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

function object(value: unknown, where: string): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${where} is not an object`)
  return value as Row
}

function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(`${where} is not an array`)
  return value as unknown[]
}

function str(row: Row, key: string, where: string): string {
  const value = row[key]
  if (typeof value !== "string") fail(`${where}.${key} is not a string`)
  return value as string
}

/** A column the database allows to be null, read as an empty string. */
function text(row: Row, key: string, where: string): string {
  const value = row[key]
  if (value === null || value === undefined) return ""
  if (typeof value !== "string") fail(`${where}.${key} is not a string`)
  return value as string
}

function nullableStr(row: Row, key: string, where: string): string | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value !== "string") fail(`${where}.${key} is not a string or null`)
  return value as string
}

function bool(row: Row, key: string, where: string): boolean {
  const value = row[key]
  if (typeof value !== "boolean") fail(`${where}.${key} is not a boolean`)
  return value as boolean
}

function int(row: Row, key: string, where: string): number {
  const value = row[key]
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${where}.${key} is not a number`)
  return value as number
}

function strings(row: Row, key: string, where: string): string[] {
  return array(row[key], `${where}.${key}`).map((entry, index) => {
    if (typeof entry !== "string") fail(`${where}.${key}[${index}] is not a string`)
    return entry as string
  })
}

function rows(row: Row, key: string, where: string): Row[] {
  return array(row[key], `${where}.${key}`).map((entry, index) => object(entry, `${where}.${key}[${index}]`))
}

/** Anything the database has not decided is `UNDECIDED`, as UX-1 read it. */
function serviceTrack(value: string): CaseServiceTrack {
  return value === "GUIDED" || value === "MANAGED" ? value : "UNDECIDED"
}

// ---------------------------------------------------------------------------
// Fact tree
// ---------------------------------------------------------------------------

function factsFrom(row: Row, capabilities: CaseFlowCapabilityFact): CaseFlowFacts {
  const where = "case"
  const authorization = object(row.authorization, `${where}.authorization`)
  const evidence = object(row.evidence, `${where}.evidence`)
  const packs = object(row.packs, `${where}.packs`)
  const commercial = object(row.commercial, `${where}.commercial`)
  const payment = object(row.payment, `${where}.payment`)
  const complaints = object(row.complaints, `${where}.complaints`)

  return {
    caseId: str(row, "caseId", where),
    reference: str(row, "reference", where),
    caseType: str(row, "caseType", where),
    technicalStage: str(row, "technicalStage", where),
    caseStatus: str(row, "caseStatus", where),
    serviceTrack: serviceTrack(text(row, "serviceTrack", where)),
    outcome: nullableStr(row, "outcome", where),
    outcomeSummary: text(row, "outcomeSummary", where),
    customerId: nullableStr(row, "customerId", where),
    businessId: nullableStr(row, "businessId", where),
    locationId: nullableStr(row, "locationId", where),
    plannedNextAction: text(row, "plannedNextAction", where),
    plannedNextActionDueAt: nullableStr(row, "plannedNextActionDueAt", where),
    allowedTransitions: strings(row, "allowedTransitions", where),
    reopened: bool(row, "reopened", where),

    tasks: rows(row, "tasks", where).map(task => ({
      id: str(task, "id", "task"),
      title: text(task, "title", "task"),
      // The model only distinguishes the customer from everyone else.
      owner: text(task, "owner", "task") === "CUSTOMER" ? "CUSTOMER" : "ADMIN",
      kind: text(task, "kind", "task"),
      status: text(task, "status", "task"),
      dueAt: str(task, "dueAt", "task"),
    })),

    submissions: rows(row, "submissions", where).map(submission => ({
      id: str(submission, "id", "submission"),
      actor: text(submission, "actor", "submission"),
      submittedAt: str(submission, "submittedAt", "submission"),
      result: nullableStr(submission, "result", "submission"),
    })),

    authorization: {
      membershipStatus: text(authorization, "membershipStatus", "authorization"),
      customerEmailVerified: bool(authorization, "customerEmailVerified", "authorization"),
      businessAuthorityVerified: bool(authorization, "businessAuthorityVerified", "authorization"),
      serviceAgreementAccepted: bool(authorization, "serviceAgreementAccepted", "authorization"),
      caseManagementPermissionActive: bool(authorization, "caseManagementPermissionActive", "authorization"),
      managerAccessVerified: bool(authorization, "managerAccessVerified", "authorization"),
      authorizationReady: bool(authorization, "authorizationReady", "authorization"),
      reviewRequired: strings(authorization, "reviewRequired", "authorization"),
      agreementKinds: strings(authorization, "agreementKinds", "authorization"),
      hasLocation: bool(authorization, "hasLocation", "authorization"),
    },

    customerActions: rows(row, "customerActions", where).map(action => ({
      id: str(action, "id", "customerAction"),
      kind: text(action, "kind", "customerAction"),
      agreementKind: nullableStr(action, "agreementKind", "customerAction"),
      status: text(action, "status", "customerAction"),
      expiresAt: str(action, "expiresAt", "customerAction"),
    })),

    evidence: {
      requests: rows(evidence, "requests", "evidence").map(request => ({
        id: str(request, "id", "evidenceRequest"),
        status: text(request, "status", "evidenceRequest"),
        dueAt: nullableStr(request, "dueAt", "evidenceRequest"),
        createdAt: str(request, "createdAt", "evidenceRequest"),
      })),
      versions: rows(evidence, "versions", "evidence").map(version => ({
        documentId: str(version, "documentId", "evidenceVersion"),
        versionId: str(version, "versionId", "evidenceVersion"),
        evidenceRequestId: nullableStr(version, "evidenceRequestId", "evidenceVersion"),
        uploadStatus: text(version, "uploadStatus", "evidenceVersion"),
        scanStatus: text(version, "scanStatus", "evidenceVersion"),
        validationStatus: text(version, "validationStatus", "evidenceVersion"),
        reviewStatus: text(version, "reviewStatus", "evidenceVersion"),
      })),
    },

    packs: {
      packs: rows(packs, "packs", "packs").map(entry => ({
        id: str(entry, "id", "pack"),
        packNumber: int(entry, "packNumber", "pack"),
        status: text(entry, "status", "pack"),
        published: bool(entry, "published", "pack"),
        everPublished: bool(entry, "everPublished", "pack"),
        itemCount: int(entry, "itemCount", "pack"),
      })),
      eligibleCount: int(packs, "eligibleCount", "packs"),
    },

    commercial: {
      complete: bool(commercial, "complete", "commercial"),
      quotes: rows(commercial, "quotes", "commercial").map(quote => ({
        id: str(quote, "id", "quote"),
        status: text(quote, "status", "quote"),
        taxBehaviour: text(quote, "taxBehaviour", "quote"),
        validUntil: str(quote, "validUntil", "quote"),
        actionStatus: nullableStr(quote, "actionStatus", "quote"),
        actionExpiresAt: nullableStr(quote, "actionExpiresAt", "quote"),
        orderId: nullableStr(quote, "orderId", "quote"),
      })),
    },

    payment: {
      complete: bool(payment, "complete", "payment"),
      orders: rows(payment, "orders", "payment").map(order => ({
        orderId: str(order, "orderId", "order"),
        paymentModel: text(order, "paymentModel", "order"),
        orderState: text(order, "orderState", "order"),
        obligationKind: nullableStr(order, "obligationKind", "order"),
        obligationState: nullableStr(order, "obligationState", "order"),
        setupReady: bool(order, "setupReady", "order"),
        consentRecorded: bool(order, "consentRecorded", "order"),
        receiptRecorded: bool(order, "receiptRecorded", "order"),
      })),
    },

    communications: rows(row, "communications", where).map(message => ({
      id: str(message, "id", "communication"),
      templateKey: nullableStr(message, "templateKey", "communication"),
      lifecycle: nullableStr(message, "lifecycle", "communication"),
      deliveryStatus: nullableStr(message, "deliveryStatus", "communication"),
      legacyStatus: nullableStr(message, "legacyStatus", "communication"),
      draftedAt: str(message, "draftedAt", "communication"),
    })),

    complaints: {
      complete: bool(complaints, "complete", "complaints"),
      open: rows(complaints, "open", "complaints").map(complaint => ({
        id: str(complaint, "id", "complaint"),
        dueAt: nullableStr(complaint, "dueAt", "complaint"),
      })),
    },

    // Deployment capability is configuration, not schema. It is attached here
    // rather than projected, so no environment variable reaches the database.
    capabilities,
  }
}

/**
 * Turns one projection response into fact trees keyed by case identifier.
 *
 * An identifier that was not asked for is rejected, and so is a repeated one:
 * the first would leak a case the caller never named, the second would make
 * "exactly one tree per case" untrue. A requested case that did not come back
 * is simply absent from the map, which `requiredCase` turns into an error at
 * the point it is used — the caller knows whether that case was expected.
 */
export function narrowCaseFlowFacts(
  payload: unknown,
  requested: readonly string[],
  capabilities: CaseFlowCapabilityFact,
): Map<string, CaseFlowFacts> {
  const envelope = object(payload, "payload")
  const entries = array(envelope.cases, "payload.cases")
  const wanted = new Set(requested)
  const facts = new Map<string, CaseFlowFacts>()

  for (const [index, entry] of entries.entries()) {
    const tree = factsFrom(object(entry, `payload.cases[${index}]`), capabilities)
    if (!wanted.has(tree.caseId)) fail(`returned ${tree.caseId}, which was not requested`)
    if (facts.has(tree.caseId)) fail(`returned ${tree.caseId} more than once`)
    facts.set(tree.caseId, tree)
  }
  return facts
}

/**
 * The entry for a case the caller expected to be there.
 *
 * There is no empty fact tree to fall back on and no recorded next action to
 * stand in for a resolved one, so an absent case is an error rather than a
 * quietly degraded row.
 */
export function requiredCase<T>(results: Map<string, T>, caseId: string): T {
  const result = results.get(caseId)
  if (result === undefined) fail(`no result for ${caseId}`)
  return result as T
}
