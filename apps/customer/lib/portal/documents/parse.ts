/**
 * Strict reader for the customer documents RPCs.
 * Unexpected shapes fail closed. Raw evidence enums are not accepted.
 */
import { isPublicCaseReference, CASE_TYPES, SERVICE_TRACKS, type CaseType, type ServiceTrack } from "@/lib/portal/cases/parse"
import { allowedMimeTypes } from "@/lib/case/model"

export const EVIDENCE_STATES = [
  "NOT_SUBMITTED",
  "UPLOAD_IN_PROGRESS",
  "RECEIVED",
  "BEING_CHECKED",
  "UNDER_REVIEW",
  "ACCEPTED",
  "NEEDS_ANOTHER",
] as const

export type EvidenceState = (typeof EVIDENCE_STATES)[number]

const REQUEST_SELECTOR = /^er-[1-9][0-9]{0,3}$/
const DOCUMENT_SELECTOR = /^pd-[1-9][0-9]{0,3}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const CONTENT_TYPES = allowedMimeTypes

export type PortalCaseContext = {
  reference: string
  caseType: CaseType
  serviceTrack: ServiceTrack
  businessName: string
  locationName: string | null
}

export type EvidenceNeed = PortalCaseContext & {
  selector: string
  title: string
  requestText: string
  dueAt: string | null
  state: EvidenceState
  filename: string | null
}

export type EvidenceSubmission = PortalCaseContext & {
  title: string
  filename: string
  submittedAt: string
  state: EvidenceState
}

export type PublishedDocument = PortalCaseContext & {
  selector: string
  title: string
  filename: string
  contentType: string
  sizeBytes: number
  publishedAt: string
}

export type CustomerDocuments = {
  needs: EvidenceNeed[]
  submissions: EvidenceSubmission[]
  documents: PublishedDocument[]
}

export type CaseEvidenceRequest = {
  selector: string
  title: string
  requestText: string
  dueAt: string | null
  state: EvidenceState
  filename: string | null
  submittedAt: string | null
  canUpload: boolean
}

export type CaseEvidenceSubmission = {
  title: string
  filename: string
  submittedAt: string
  state: EvidenceState
}

export type CasePublishedDocument = {
  selector: string
  title: string
  filename: string
  contentType: string
  sizeBytes: number
  publishedAt: string
}

export type GuidedPackHandover = {
  title: string
  serviceName: "Guided Relaunch" | "Guided Review"
  packNumber: number
  instructions: string
  instructionSelectors: string[]
  customerSubmitted: boolean
  correctionRequested: boolean
}

export type CustomerCaseDocuments = {
  found: true
  case: PortalCaseContext
  requests: CaseEvidenceRequest[]
  submissions: CaseEvidenceSubmission[]
  documents: CasePublishedDocument[]
  pack: GuidedPackHandover | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => present.includes(key))
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max || trimmed !== value) return null
  return trimmed
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null
  return text(value, max)
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && ISO_TIME.test(value) ? value : null
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null
  return timestamp(value)
}

function state(value: unknown): EvidenceState | null {
  return typeof value === "string" && (EVIDENCE_STATES as readonly string[]).includes(value) ? value as EvidenceState : null
}

function contentType(value: unknown): string | null {
  return typeof value === "string" && (CONTENT_TYPES as readonly string[]).includes(value) ? value : null
}

function size(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 10_485_760 ? value : null
}

function filename(value: unknown): string | null {
  const name = text(value, 255)
  if (!name || /[\\/]/.test(name)) return null
  return name
}

function context(row: Record<string, unknown>): PortalCaseContext | null {
  const reference = text(row.reference, 20)
  const caseType = text(row.caseType, 40)
  const serviceTrack = text(row.serviceTrack, 20)
  const businessName = text(row.businessName, 200)
  const locationName = optionalText(row.locationName, 200)
  if (!reference || !isPublicCaseReference(reference) || !caseType || !serviceTrack || !businessName || locationName === undefined) return null
  if (!(CASE_TYPES as readonly string[]).includes(caseType)) return null
  if (!(SERVICE_TRACKS as readonly string[]).includes(serviceTrack)) return null
  return {
    reference,
    caseType: caseType as CaseType,
    serviceTrack: serviceTrack as ServiceTrack,
    businessName,
    locationName,
  }
}

function arrayOf(value: unknown, limit: number): unknown[] | null {
  if (!Array.isArray(value) || value.length > limit) return null
  return value
}

export function parseDocuments(value: unknown): CustomerDocuments | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["needs", "submissions", "documents"])) return null
  const needs = arrayOf(row.needs, 100)
  const submissions = arrayOf(row.submissions, 100)
  const documents = arrayOf(row.documents, 100)
  if (!needs || !submissions || !documents) return null
  const parsedNeeds: EvidenceNeed[] = []
  for (const item of needs) {
    const parsed = parseNeed(item)
    if (!parsed) return null
    parsedNeeds.push(parsed)
  }
  const parsedSubmissions: EvidenceSubmission[] = []
  for (const item of submissions) {
    const parsed = parseSubmission(item)
    if (!parsed) return null
    parsedSubmissions.push(parsed)
  }
  const parsedDocuments: PublishedDocument[] = []
  for (const item of documents) {
    const parsed = parsePublished(item)
    if (!parsed) return null
    parsedDocuments.push(parsed)
  }
  return { needs: parsedNeeds, submissions: parsedSubmissions, documents: parsedDocuments }
}

function parseNeed(value: unknown): EvidenceNeed | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["reference", "caseType", "serviceTrack", "businessName", "locationName", "selector", "title", "requestText", "dueAt", "state", "filename"])) return null
  const shared = context(row)
  const selector = text(row.selector, 8)
  const title = text(row.title, 200)
  const requestText = text(row.requestText, 4000)
  const dueAt = optionalTimestamp(row.dueAt)
  const evidenceState = state(row.state)
  const evidenceFilename = optionalText(row.filename, 255)
  if (!shared || !selector || !REQUEST_SELECTOR.test(selector) || !title || !requestText || dueAt === undefined || !evidenceState || evidenceFilename === undefined) return null
  if (evidenceFilename && /[\\/]/.test(evidenceFilename)) return null
  return { ...shared, selector, title, requestText, dueAt, state: evidenceState, filename: evidenceFilename }
}

function parseSubmission(value: unknown): EvidenceSubmission | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["reference", "caseType", "serviceTrack", "businessName", "locationName", "title", "filename", "submittedAt", "state"])) return null
  const shared = context(row)
  const title = text(row.title, 200)
  const evidenceFilename = filename(row.filename)
  const submittedAt = timestamp(row.submittedAt)
  const evidenceState = state(row.state)
  if (!shared || !title || !evidenceFilename || !submittedAt || !evidenceState) return null
  return { ...shared, title, filename: evidenceFilename, submittedAt, state: evidenceState }
}

function parsePublished(value: unknown): PublishedDocument | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["reference", "caseType", "serviceTrack", "businessName", "locationName", "selector", "title", "filename", "contentType", "sizeBytes", "publishedAt"])) return null
  const shared = context(row)
  const selector = text(row.selector, 8)
  const title = text(row.title, 200)
  const evidenceFilename = filename(row.filename)
  const type = contentType(row.contentType)
  const bytes = size(row.sizeBytes)
  const publishedAt = timestamp(row.publishedAt)
  if (!shared || !selector || !DOCUMENT_SELECTOR.test(selector) || !title || !evidenceFilename || !type || bytes === null || !publishedAt) return null
  return { ...shared, selector, title, filename: evidenceFilename, contentType: type, sizeBytes: bytes, publishedAt }
}

export function parseCaseDocuments(value: unknown): CustomerCaseDocuments | "not_found" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["found"]) && row.found === false) return "not_found"
  if (!sameKeys(row, ["found", "case", "requests", "submissions", "documents", "pack"]) || row.found !== true) return null
  const caseRow = record(row.case)
  if (!caseRow || !sameKeys(caseRow, ["reference", "caseType", "serviceTrack", "businessName", "locationName"])) return null
  const shared = context(caseRow)
  const requests = arrayOf(row.requests, 50)
  const submissions = arrayOf(row.submissions, 50)
  const documents = arrayOf(row.documents, 50)
  if (!shared || !requests || !submissions || !documents) return null
  const parsedRequests: CaseEvidenceRequest[] = []
  for (const item of requests) {
    const parsed = parseCaseRequest(item)
    if (!parsed) return null
    parsedRequests.push(parsed)
  }
  const parsedSubmissions: CaseEvidenceSubmission[] = []
  for (const item of submissions) {
    const parsed = parseCaseSubmission(item)
    if (!parsed) return null
    parsedSubmissions.push(parsed)
  }
  const parsedDocuments: CasePublishedDocument[] = []
  for (const item of documents) {
    const parsed = parseCaseDocument(item)
    if (!parsed) return null
    parsedDocuments.push(parsed)
  }
  const pack = parseGuidedPack(row.pack)
  if (pack === undefined) return null
  return { found: true, case: shared, requests: parsedRequests, submissions: parsedSubmissions, documents: parsedDocuments, pack }
}

export const GUIDED_PACK_INSTRUCTIONS = "You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you."

function parseGuidedPack(value: unknown): GuidedPackHandover | null | undefined {
  if (value === null) return null
  const row = record(value)
  if (!row || !sameKeys(row, ["title", "serviceName", "packNumber", "instructions", "instructionSelectors", "customerSubmitted", "correctionRequested"])) return undefined
  const title = text(row.title, 80)
  const serviceName = row.serviceName === "Guided Relaunch" || row.serviceName === "Guided Review" ? row.serviceName : null
  const packNumber = typeof row.packNumber === "number" && Number.isSafeInteger(row.packNumber) && row.packNumber >= 1 && row.packNumber <= 99 ? row.packNumber : null
  const selectors = arrayOf(row.instructionSelectors, 20)
  if (!title || !serviceName || !packNumber || row.instructions !== GUIDED_PACK_INSTRUCTIONS || !selectors) return undefined
  if (typeof row.customerSubmitted !== "boolean" || typeof row.correctionRequested !== "boolean") return undefined
  const instructionSelectors: string[] = []
  for (const selector of selectors) {
    if (typeof selector !== "string" || !DOCUMENT_SELECTOR.test(selector)) return undefined
    instructionSelectors.push(selector)
  }
  return { title, serviceName, packNumber, instructions: GUIDED_PACK_INSTRUCTIONS, instructionSelectors, customerSubmitted: row.customerSubmitted, correctionRequested: row.correctionRequested }
}

function parseCaseRequest(value: unknown): CaseEvidenceRequest | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["selector", "title", "requestText", "dueAt", "state", "filename", "submittedAt", "canUpload"])) return null
  const selector = text(row.selector, 8)
  const title = text(row.title, 200)
  const requestText = text(row.requestText, 4000)
  const dueAt = optionalTimestamp(row.dueAt)
  const evidenceState = state(row.state)
  const evidenceFilename = optionalText(row.filename, 255)
  const submittedAt = optionalTimestamp(row.submittedAt)
  if (!selector || !REQUEST_SELECTOR.test(selector) || !title || !requestText || dueAt === undefined || !evidenceState || evidenceFilename === undefined || submittedAt === undefined || typeof row.canUpload !== "boolean") return null
  if (evidenceFilename && /[\\/]/.test(evidenceFilename)) return null
  return { selector, title, requestText, dueAt, state: evidenceState, filename: evidenceFilename, submittedAt, canUpload: row.canUpload }
}

function parseCaseSubmission(value: unknown): CaseEvidenceSubmission | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["title", "filename", "submittedAt", "state"])) return null
  const title = text(row.title, 200)
  const evidenceFilename = filename(row.filename)
  const submittedAt = timestamp(row.submittedAt)
  const evidenceState = state(row.state)
  if (!title || !evidenceFilename || !submittedAt || !evidenceState) return null
  return { title, filename: evidenceFilename, submittedAt, state: evidenceState }
}

function parseCaseDocument(value: unknown): CasePublishedDocument | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["selector", "title", "filename", "contentType", "sizeBytes", "publishedAt"])) return null
  const selector = text(row.selector, 8)
  const title = text(row.title, 200)
  const evidenceFilename = filename(row.filename)
  const type = contentType(row.contentType)
  const bytes = size(row.sizeBytes)
  const publishedAt = timestamp(row.publishedAt)
  if (!selector || !DOCUMENT_SELECTOR.test(selector) || !title || !evidenceFilename || !type || bytes === null || !publishedAt) return null
  return { selector, title, filename: evidenceFilename, contentType: type, sizeBytes: bytes, publishedAt }
}
