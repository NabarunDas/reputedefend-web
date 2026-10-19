/**
 * The assessment judgement for guided Step 5.
 *
 * Pure. A draft, a review, or a form post does not complete the step.
 * Completion is an approved version that the reviewed read still calls current,
 * recommending Guided or Managed, and that still agrees with the evidence
 * projection. A recommendation is not an accepted service agreement.
 */

import { summariseEvidence } from "../case-flow/evidence"
import type { CaseFlowEvidenceFact } from "../case-flow/model"
import { isUuid } from "../records/model"

export const assessmentPathways = ["GUIDED", "MANAGED", "UNDECIDED"] as const
export type AssessmentPathway = (typeof assessmentPathways)[number]

export const assessmentOperations = ["save_draft", "submit_review", "approve"] as const
export type AssessmentOperation = (typeof assessmentOperations)[number]

export type AssessmentPhase = "none" | "draft" | "reviewed" | "approved" | "stale" | "reopened"

export type AssessmentJudgement = {
  phase: AssessmentPhase
  pathway: AssessmentPathway | null
  versionNumber: number | null
}

export type AssessmentVersionView = {
  id: string
  versionNumber: number
  status: "DRAFT" | "REVIEWED" | "APPROVED"
  recordVersion: number
  findings: string
  evidenceConsidered: string
  profileIssue: string
  policyConcerns: string
  recommendedAction: string
  servicePathway: AssessmentPathway
  rationale: string
  risks: string
  outstandingInformation: string
  draftedAt: string
  reviewedAt: string | null
  approvedAt: string | null
  current: boolean
  stale: boolean
  staleReason: "facts" | "reopened" | null
}

export type CaseAssessmentView = {
  workflowVersion: number
  basisFingerprint: string
  reopenedAt: string | null
  versions: AssessmentVersionView[]
}

export type AssessmentDraft = {
  recordVersion: number
  findings: string
  evidenceConsidered: string
  profileIssue: string
  policyConcerns: string
  recommendedAction: string
  servicePathway: AssessmentPathway
  rationale: string
  risks: string
  outstandingInformation: string
}

const limits = {
  findings: [20, 4000],
  evidenceConsidered: [10, 4000],
  profileIssue: [0, 2000],
  policyConcerns: [0, 2000],
  recommendedAction: [10, 2000],
  rationale: [20, 4000],
  risks: [10, 2000],
  outstandingInformation: [0, 2000],
} as const

const draftKeys = [
  "evidenceConsidered",
  "findings",
  "outstandingInformation",
  "policyConcerns",
  "profileIssue",
  "rationale",
  "recommendedAction",
  "recordVersion",
  "risks",
  "servicePathway",
] as const

/**
 * The same evidence gate the proposed approval command uses.
 * Delivery of the request email is not part of it. A rejected file is history.
 */
export function evidenceReadyForAssessment(evidence: CaseFlowEvidenceFact): boolean {
  const summary = summariseEvidence(evidence, [])
  const problems = summary.threatBlocked + summary.contentInvalid + summary.scanInProgress + summary.uploadInProgress + summary.needsScanCheck
  return summary.complete && summary.accepted > 0 && summary.awaitingReview === 0 && problems === 0
}

export function judgeAssessment(view: CaseAssessmentView | null): AssessmentJudgement {
  if (!view || view.versions.length === 0) return { phase: "none", pathway: null, versionNumber: null }
  const approved = view.versions
    .filter(version => version.status === "APPROVED")
    .sort((left, right) => right.versionNumber - left.versionNumber)
  const latest = approved[0]
  if (latest) {
    const pathway = latest.servicePathway
    if (latest.current && !latest.stale && (pathway === "GUIDED" || pathway === "MANAGED")) {
      return { phase: "approved", pathway, versionNumber: latest.versionNumber }
    }
    if (latest.staleReason === "reopened") {
      return { phase: "reopened", pathway, versionNumber: latest.versionNumber }
    }
    return { phase: "stale", pathway, versionNumber: latest.versionNumber }
  }
  const open = view.versions.find(version => version.status === "DRAFT" || version.status === "REVIEWED")
  if (open?.status === "REVIEWED") return { phase: "reviewed", pathway: open.servicePathway, versionNumber: open.versionNumber }
  if (open?.status === "DRAFT") return { phase: "draft", pathway: open.servicePathway, versionNumber: open.versionNumber }
  return { phase: "none", pathway: null, versionNumber: null }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function bounded(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string" || value.length > max) return null
  const trimmed = value.trim()
  if (trimmed.length < min || trimmed.length > max) return null
  return trimmed
}

function pathwayOf(value: unknown): AssessmentPathway | null {
  return value === "GUIDED" || value === "MANAGED" || value === "UNDECIDED" ? value : null
}

function statusOf(value: unknown): AssessmentVersionView["status"] | null {
  return value === "DRAFT" || value === "REVIEWED" || value === "APPROVED" ? value : null
}

function optionalTime(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== "string" || value.trim() === "") return undefined
  return value
}

function versionOf(value: unknown): AssessmentVersionView | null {
  const row = asRecord(value)
  if (!row) return null
  const status = statusOf(row.status)
  const servicePathway = pathwayOf(row.servicePathway)
  const findings = bounded(row.findings, limits.findings[0], limits.findings[1])
  const evidenceConsidered = bounded(row.evidenceConsidered, limits.evidenceConsidered[0], limits.evidenceConsidered[1])
  const profileIssue = bounded(row.profileIssue, limits.profileIssue[0], limits.profileIssue[1])
  const policyConcerns = bounded(row.policyConcerns, limits.policyConcerns[0], limits.policyConcerns[1])
  const recommendedAction = bounded(row.recommendedAction, limits.recommendedAction[0], limits.recommendedAction[1])
  const rationale = bounded(row.rationale, limits.rationale[0], limits.rationale[1])
  const risks = bounded(row.risks, limits.risks[0], limits.risks[1])
  const outstandingInformation = bounded(row.outstandingInformation, limits.outstandingInformation[0], limits.outstandingInformation[1])
  const draftedAt = optionalTime(row.draftedAt)
  const reviewedAt = optionalTime(row.reviewedAt)
  const approvedAt = optionalTime(row.approvedAt)
  const staleReason = row.staleReason === null ? null : row.staleReason === "facts" || row.staleReason === "reopened" ? row.staleReason : undefined
  if (
    !isUuid(row.id) || status === null || servicePathway === null || findings === null || evidenceConsidered === null
    || profileIssue === null || policyConcerns === null || recommendedAction === null || rationale === null
    || risks === null || outstandingInformation === null || typeof draftedAt !== "string" || reviewedAt === undefined
    || approvedAt === undefined || staleReason === undefined
    || !Number.isSafeInteger(row.versionNumber) || (row.versionNumber as number) < 1
    || !Number.isSafeInteger(row.recordVersion) || (row.recordVersion as number) < 1
    || typeof row.current !== "boolean" || typeof row.stale !== "boolean"
  ) return null
  return {
    id: row.id,
    versionNumber: row.versionNumber as number,
    status,
    recordVersion: row.recordVersion as number,
    findings,
    evidenceConsidered,
    profileIssue,
    policyConcerns,
    recommendedAction,
    servicePathway,
    rationale,
    risks,
    outstandingInformation,
    draftedAt,
    reviewedAt,
    approvedAt,
    current: row.current,
    stale: row.stale,
    staleReason,
  }
}

/** The reviewed read. A missing or unreadable payload leaves the step unapproved. */
export function parseCaseAssessment(value: unknown): CaseAssessmentView | null {
  const body = asRecord(value)
  if (!body || body.missing === true || !Array.isArray(body.versions)) return null
  if (!Number.isSafeInteger(body.workflowVersion) || (body.workflowVersion as number) < 1) return null
  if (typeof body.basisFingerprint !== "string" || !/^[0-9a-f]{32}$/.test(body.basisFingerprint)) return null
  const reopenedAt = optionalTime(body.reopenedAt)
  if (reopenedAt === undefined) return null
  const versions: AssessmentVersionView[] = []
  for (const row of body.versions) {
    const version = versionOf(row)
    if (!version) return null
    versions.push(version)
  }
  return { workflowVersion: body.workflowVersion as number, basisFingerprint: body.basisFingerprint, reopenedAt, versions }
}

function recordVersionOf(value: unknown, allowZero: boolean): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null
  if (value < (allowZero ? 0 : 1) || value > 1000000) return null
  return value
}

export function parseAssessmentCommand(raw: unknown): {
  caseId: string
  version: number
  operation: AssessmentOperation
  data: AssessmentDraft | { recordVersion: number }
} | null {
  const body = asRecord(raw)
  if (!body) return null
  const keys = Object.keys(body)
  if (keys.length !== 4 || !["caseId", "version", "operation", "data"].every(key => Object.hasOwn(body, key))) return null
  if (!isUuid(body.caseId) || !Number.isSafeInteger(body.version) || (body.version as number) < 1) return null
  if (body.operation !== "save_draft" && body.operation !== "submit_review" && body.operation !== "approve") return null
  const data = asRecord(body.data)
  if (!data) return null
  if (body.operation === "save_draft") {
    const dataKeys = Object.keys(data).sort()
    if (dataKeys.length !== draftKeys.length || draftKeys.some((key, index) => key !== dataKeys[index])) return null
    const findings = bounded(data.findings, limits.findings[0], limits.findings[1])
    const evidenceConsidered = bounded(data.evidenceConsidered, limits.evidenceConsidered[0], limits.evidenceConsidered[1])
    const profileIssue = bounded(data.profileIssue, limits.profileIssue[0], limits.profileIssue[1])
    const policyConcerns = bounded(data.policyConcerns, limits.policyConcerns[0], limits.policyConcerns[1])
    const recommendedAction = bounded(data.recommendedAction, limits.recommendedAction[0], limits.recommendedAction[1])
    const rationale = bounded(data.rationale, limits.rationale[0], limits.rationale[1])
    const risks = bounded(data.risks, limits.risks[0], limits.risks[1])
    const outstandingInformation = bounded(data.outstandingInformation, limits.outstandingInformation[0], limits.outstandingInformation[1])
    const servicePathway = pathwayOf(data.servicePathway)
    const recordVersion = recordVersionOf(data.recordVersion, true)
    if (
      findings === null || evidenceConsidered === null || profileIssue === null || policyConcerns === null
      || recommendedAction === null || rationale === null || risks === null || outstandingInformation === null
      || servicePathway === null || recordVersion === null
    ) return null
    return {
      caseId: body.caseId,
      version: body.version as number,
      operation: "save_draft",
      data: {
        recordVersion,
        findings,
        evidenceConsidered,
        profileIssue,
        policyConcerns,
        recommendedAction,
        servicePathway,
        rationale,
        risks,
        outstandingInformation,
      },
    }
  }
  if (Object.keys(data).length !== 1 || !Object.hasOwn(data, "recordVersion")) return null
  const recordVersion = recordVersionOf(data.recordVersion, false)
  if (recordVersion === null) return null
  return {
    caseId: body.caseId,
    version: body.version as number,
    operation: body.operation,
    data: { recordVersion },
  }
}

export function assessmentPathwayLabel(pathway: AssessmentPathway): string {
  if (pathway === "GUIDED") return "Guided"
  if (pathway === "MANAGED") return "Managed"
  return "Not yet decided"
}
