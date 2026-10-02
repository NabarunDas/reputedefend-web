/**
 * The server side of the case flow model: read the facts, then resolve them.
 *
 * Every read here goes through an Admin query that already exists, which is
 * the whole point. UX-1 adds no table, no RPC, no view and no migration; it
 * composes `admin_case_detail_v1`, `admin_case_authorization_v1`,
 * `admin_evidence_case_v1`, `admin_prepared_pack_case_v1`,
 * `admin_communication_list_v1`, `admin_quote_list_v1`,
 * `admin_payment_list_v1` and `admin_complaint_list_v1`, all of which are
 * `SECURITY DEFINER` behind a staff session.
 *
 * Three of those are not case-scoped, so they are filtered here and the
 * result carries a `complete` flag saying whether the filter could have
 * missed something. The resolver treats an incomplete read as "unknown",
 * never as "nothing exists" — see `CONFIRM_COMMERCIAL_STATE` and
 * `CONFIRM_PAYMENT_STATE`. The query cost of all this, and the batch
 * projection UX-3 will need instead, are written up in
 * `docs/admin/ux-case-flow-model.md`.
 *
 * Nothing here returns a secret. The projections it consumes already mask
 * email addresses and have never carried an action secret, a storage key, a
 * provider key or an OAuth token.
 */

import "server-only"

import { getCaseAuthorization } from "../authorization/queries"
import { getCase } from "../cases/queries"
import { loadCommunications } from "../communications/queries"
import { communicationsSendEnabled } from "../communications/gate"
import { loadQuotes } from "../commerce/queries"
import { getEvidenceCase } from "../evidence/queries"
import { googleConnectionExecutionAvailable } from "../../../../lib/google-business-profile/live-stack"
import { getPreparedPackCase } from "../packs/queries"
import { loadMoney } from "../payments/queries"
import { paymentsEnabled } from "../../../../lib/payments/config"
import { loadComplaints } from "../settings/queries"
import { isUuid } from "../records/model"
import { resolveCaseFlow } from "./resolve"
import type {
  CaseFlowCustomerActionFact,
  CaseFlowEvidenceVersionFact,
  CaseFlowFacts,
  CaseFlowModel,
  CaseServiceTrack,
} from "./model"

/**
 * The quote list comes back capped at this many rows with no case filter, so
 * an empty case-filtered result from a full page proves nothing.
 */
const QUOTE_PAGE_SIZE = 100
const COMPLAINT_PAGE_SIZE = 100

export async function loadCaseFlow(caseId: string, now: Date = new Date()): Promise<CaseFlowModel> {
  return resolveCaseFlow(await loadCaseFlowFacts(caseId), now.toISOString())
}

export async function loadCaseFlowFacts(caseId: string): Promise<CaseFlowFacts> {
  const detail = await getCase(caseId)
  const [authorization, evidence, packs, communications, quotes, money, complaints] = await Promise.all([
    getCaseAuthorization(caseId),
    getEvidenceCase(caseId),
    getPreparedPackCase(caseId),
    loadCommunications(caseId),
    loadQuotes(),
    loadMoney(),
    loadComplaints("open"),
  ])

  const agreementKindById = new Map(authorization.agreements.map(entry => [entry.id, entry.kind]))
  const customerActions: CaseFlowCustomerActionFact[] = authorization.actions.map(action => ({
    id: action.id,
    kind: action.kind,
    agreementKind: action.agreementVersionId ? agreementKindById.get(action.agreementVersionId) ?? null : null,
    status: action.status,
    expiresAt: action.expiresAt,
  }))

  const versions: CaseFlowEvidenceVersionFact[] = evidence.documents.flatMap(document =>
    document.versions.map(version => ({
      documentId: document.id,
      versionId: version.id,
      evidenceRequestId: document.evidenceRequestId,
      uploadStatus: version.uploadStatus,
      scanStatus: version.scanStatus,
      validationStatus: version.validationStatus,
      reviewStatus: version.reviewStatus,
    })),
  )

  const caseQuotes = quotes.quotes.filter(quote => quote.caseId === caseId)
  const caseOrders = money.orders.filter(order => order.caseId === caseId)
  const complaintRows = openComplaintsFor(complaints, caseId)

  return {
    caseId: detail.id,
    reference: detail.reference,
    caseType: detail.type,
    technicalStage: detail.stage,
    caseStatus: detail.status,
    serviceTrack: serviceTrack(detail.track),
    outcome: detail.outcome,
    outcomeSummary: detail.summary,
    customerId: detail.customerId || null,
    businessId: detail.businessId || null,
    locationId: detail.locationId || null,
    plannedNextAction: detail.nextAction,
    plannedNextActionDueAt: detail.due,
    allowedTransitions: detail.transitions,
    reopened: detail.events.some(event => event.event === "reopen"),

    tasks: detail.tasks.map(task => ({
      id: task.id,
      title: task.title,
      owner: task.owner === "CUSTOMER" ? "CUSTOMER" : "ADMIN",
      kind: task.kind,
      status: task.status,
      dueAt: task.due,
    })),
    submissions: detail.submissions.map(submission => ({
      id: submission.id,
      actor: submission.actor,
      submittedAt: submission.submittedAt,
      result: submission.result,
    })),
    authorization: {
      membershipStatus: authorization.membershipStatus,
      customerEmailVerified: authorization.readiness.customerEmailVerified,
      businessAuthorityVerified: authorization.readiness.businessAuthorityVerified,
      serviceAgreementAccepted: authorization.readiness.serviceAgreementAccepted,
      caseManagementPermissionActive: authorization.readiness.caseManagementPermissionActive,
      managerAccessVerified: authorization.readiness.managerAccessVerified,
      authorizationReady: authorization.readiness.authorizationReady,
      reviewRequired: authorization.authorizations
        .filter(record => record.status === "REVIEW_REQUIRED")
        .map(record => record.kind),
      agreementKinds: [...new Set(authorization.agreements.map(entry => entry.kind))],
      hasLocation: !!authorization.locationId,
    },
    customerActions,
    evidence: {
      requests: evidence.requests.map(request => ({
        id: request.id,
        status: request.status,
        dueAt: request.dueAt,
        createdAt: request.createdAt,
      })),
      versions,
    },
    packs: {
      packs: packs.packs.map(pack => ({
        id: pack.id,
        packNumber: pack.packNumber,
        status: pack.status,
        published: !!pack.published,
        everPublished: !!pack.publishedAt,
        itemCount: pack.items.length,
      })),
      eligibleCount: packs.eligible.length,
    },
    commercial: {
      complete: caseQuotes.length > 0 || quotes.quotes.length < QUOTE_PAGE_SIZE,
      quotes: caseQuotes.map(quote => ({
        id: quote.id,
        status: quote.status,
        taxBehaviour: quote.currentVersion.taxBehaviour,
        validUntil: quote.currentVersion.validUntil,
        actionStatus: quote.action?.status ?? null,
        actionExpiresAt: quote.action?.expiresAt ?? null,
        orderId: quote.orderId,
      })),
    },
    payment: {
      // `admin_payment_list_v1` is unpaginated, so a case-filtered empty
      // result is genuinely empty rather than possibly truncated.
      complete: true,
      orders: caseOrders.map(order => ({
        orderId: order.orderId,
        paymentModel: order.paymentModel,
        orderState: order.orderState,
        obligationKind: order.obligationKind,
        obligationState: order.obligationState,
        setupReady: order.setupReady,
        consentRecorded: !!order.consentId,
        receiptRecorded: !!order.receiptId,
      })),
    },
    communications: communications.communications.map(row => ({
      id: row.id,
      templateKey: row.templateKey,
      lifecycle: row.lifecycle,
      deliveryStatus: row.deliveryStatus,
      legacyStatus: row.legacyStatus,
      draftedAt: row.draftedAt,
    })),
    complaints: complaintRows,
    capabilities: {
      liveMailEnabled: communicationsSendEnabled(),
      paymentsEnabled: paymentsEnabled(),
      googleSubmissionLive: googleConnectionExecutionAvailable(),
    },
  }
}

function serviceTrack(value: string): CaseServiceTrack {
  return value === "GUIDED" || value === "MANAGED" ? value : "UNDECIDED"
}

/**
 * `admin_complaint_list_v1` is loosely typed on this side, so the rows are
 * narrowed rather than cast. A row that does not look like a complaint is
 * dropped: an unreadable row must not become a phantom blocker.
 */
function openComplaintsFor(payload: unknown, caseId: string): CaseFlowFacts["complaints"] {
  const rows = (payload as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) return { complete: false, open: [] }
  const open: Array<{ id: string; dueAt: string | null }> = []
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue
    const entry = row as { id?: unknown; caseId?: unknown; dueAt?: unknown }
    if (entry.caseId !== caseId || typeof entry.id !== "string" || !isUuid(entry.id)) continue
    open.push({ id: entry.id, dueAt: typeof entry.dueAt === "string" ? entry.dueAt : null })
  }
  return { complete: open.length > 0 || rows.length < COMPLAINT_PAGE_SIZE, open }
}
