/**
 * The server side of the case flow model: read the facts, then resolve them.
 *
 * UX-1 composed eight existing Admin reads per case — `admin_case_detail_v1`,
 * `admin_case_authorization_v1`, `admin_evidence_case_v1`,
 * `admin_prepared_pack_case_v1`, `admin_communication_list_v1`,
 * `admin_quote_list_v1`, `admin_payment_list_v1` and
 * `admin_complaint_list_v1` — and wrote up, in `docs/admin/ux-case-flow-model.md`,
 * why that could not be looped over a queue. UX-3 is the replacement: a single
 * case-scoped projection, `admin_case_flow_facts_v1`, that answers for up to
 * fifty cases in one call.
 *
 * Everything else is unchanged. `resolveCaseFlow` is still the only thing that
 * decides a phase, an action, a blocker or a prerequisite, and it is still the
 * pure function UX-1 shipped; this module reads facts and hands them over. The
 * projection returns no secret: no customer-action secret, no storage key, no
 * provider or OAuth credential, no token and no email address.
 *
 * Two facts are stronger than they were, because the projection is scoped to
 * the case rather than filtered out of a global page. `commercial.complete`
 * and `complaints.complete` are now authoritative, so the resolver stops
 * reporting an unknown commercial position that was only ever an artefact of a
 * hundred-row list. `reopened` is now an existence check over the whole event
 * history rather than a scan of the most recent fifty-one events, which closes
 * the DATA_PROJECTION_GAP UX-1 recorded.
 */

import "server-only"

import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { communicationsSendEnabled } from "../communications/gate"
import { googleConnectionExecutionAvailable } from "../../../../lib/google-business-profile/live-stack"
import { paymentsEnabled } from "../../../../lib/payments/config"
import { isUuid } from "../records/model"
import { caseFlowBatchIds, narrowCaseFlowFacts, requiredCase } from "./projection"
import { resolveCaseFlow } from "./resolve"
import type { CaseFlowCapabilityFact, CaseFlowFacts, CaseFlowModel } from "./model"

export { CASE_FLOW_BATCH_LIMIT, requiredCase } from "./projection"

async function read<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<T | null>(name, { ...args, p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

/**
 * What this deployment can actually do. These come from environment
 * configuration, so they are attached after the database facts rather than
 * projected from the database.
 */
function capabilities(): CaseFlowCapabilityFact {
  return {
    liveMailEnabled: communicationsSendEnabled(),
    paymentsEnabled: paymentsEnabled(),
    googleSubmissionLive: googleConnectionExecutionAvailable(),
  }
}

/**
 * Facts for a bounded set of cases, in one round trip.
 *
 * The returned map is keyed by case identifier because the database is under
 * no obligation to answer in the order it was asked. A case that does not
 * exist is absent rather than empty.
 */
export async function loadCaseFlowsFacts(caseIds: readonly string[]): Promise<Map<string, CaseFlowFacts>> {
  const ids = caseFlowBatchIds(caseIds)
  if (ids.length === 0) return new Map()
  const payload = await read<unknown>("admin_case_flow_facts_v1", { p_case_ids: ids })
  return narrowCaseFlowFacts(payload, ids, capabilities())
}

/** The resolved model for each case, from one projection call. */
export async function loadCaseFlows(
  caseIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, CaseFlowModel>> {
  const at = now.toISOString()
  const flows = new Map<string, CaseFlowModel>()
  for (const [caseId, facts] of await loadCaseFlowsFacts(caseIds)) {
    flows.set(caseId, resolveCaseFlow(facts, at))
  }
  return flows
}

export async function loadCaseFlow(caseId: string, now: Date = new Date()): Promise<CaseFlowModel> {
  // A case that does not exist is a 404, exactly as it was when this read
  // began with `getCase`.
  if (!isUuid(caseId)) notFound()
  const flows = await loadCaseFlows([caseId], now)
  if (!flows.has(caseId)) notFound()
  return requiredCase(flows, caseId)
}

export async function loadCaseFlowFacts(caseId: string): Promise<CaseFlowFacts> {
  if (!isUuid(caseId)) notFound()
  const facts = await loadCaseFlowsFacts([caseId])
  if (!facts.has(caseId)) notFound()
  return requiredCase(facts, caseId)
}
