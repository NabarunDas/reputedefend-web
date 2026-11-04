import { createHash } from "node:crypto"

import type { CallRecord, EventReceipt, StoredCall, VoiceEnvironment, VoiceLogEntry, VoiceState } from "./types"
import { EMPTY_VOICE_STATE } from "./types"
import { applyProjectedEvent, finaliseWithoutAnalysis } from "./lifecycle"
import { ensureNotificationIntent, markIntentFailed } from "./notify"
import { verifyRetellSignature, type SignatureInput } from "./signature"
import { resolveTenant, type TenantQuery, type TenantResult } from "./tenant"
import { projectRetellEvent, type ProjectResult } from "./validate"

export function isVoiceWebhookEnabled(flag: string | undefined): boolean {
  return flag === "true"
}

export function hashRawBody(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex")
}

export type AcceptDeps = {
  verify?: (input: SignatureInput) => boolean
  project?: (rawBody: string) => ProjectResult
  resolveTenant?: (query: TenantQuery) => TenantResult
}

export type AcceptInput = {
  state?: VoiceState
  enabledFlag: string | undefined
  environment: VoiceEnvironment
  apiKey: string
  nowMs: number
  nowIso: string
  rawBody: string
  signatureHeader: string | null
  maps: TenantQuery["maps"]
  deps?: AcceptDeps
}

export type AcceptResult = {
  state: VoiceState
  status: 204 | 401 | 404
  body: ""
  log: VoiceLogEntry
}

function log(entry: Omit<VoiceLogEntry, "notificationStatus"> & { notificationStatus?: VoiceLogEntry["notificationStatus"] }): VoiceLogEntry {
  return { notificationStatus: "none", ...entry }
}

function findReceipt(state: VoiceState, environment: VoiceEnvironment, event: EventReceipt["event"], callId: string): EventReceipt | undefined {
  return state.receipts.find((receipt) => receipt.environment === environment && receipt.event === event && receipt.callId === callId)
}

function findCall(state: VoiceState, environment: VoiceEnvironment, callId: string): StoredCall | undefined {
  return state.calls.find((call) => call.environment === environment && call.record.lead.providerCallRef === callId)
}

function notificationStatus(record: CallRecord | undefined): VoiceLogEntry["notificationStatus"] {
  return record?.notification?.status ?? "none"
}

function putCall(state: VoiceState, environment: VoiceEnvironment, record: CallRecord): VoiceState {
  const without = state.calls.filter((call) => !(call.environment === environment && call.record.lead.providerCallRef === record.lead.providerCallRef))
  return { ...state, calls: [...without, { environment, record }] }
}

function putReceipt(state: VoiceState, receipt: EventReceipt): VoiceState {
  return { ...state, receipts: [...state.receipts, receipt] }
}

export function acceptVoiceWebhook(input: AcceptInput): AcceptResult {
  const state = input.state ?? EMPTY_VOICE_STATE
  const verify = input.deps?.verify ?? verifyRetellSignature
  const project = input.deps?.project ?? projectRetellEvent
  const resolve = input.deps?.resolveTenant ?? resolveTenant

  if (!isVoiceWebhookEnabled(input.enabledFlag)) {
    return { state, status: 404, body: "", log: log({ event: null, callId: null, outcome: "closed" }) }
  }

  const verified = verify({
    rawBody: input.rawBody,
    apiKey: input.apiKey,
    signature: input.signatureHeader,
    nowMs: input.nowMs,
  })
  if (!verified) {
    return { state, status: 401, body: "", log: log({ event: null, callId: null, outcome: "rejected_signature" }) }
  }

  const projected = project(input.rawBody)
  if (!projected.ok) {
    return {
      state,
      status: 204,
      body: "",
      log: log({ event: null, callId: projected.callId, outcome: "rejected_schema" }),
    }
  }

  const hash = hashRawBody(input.rawBody)
  const existingReceipt = findReceipt(state, input.environment, projected.projected.event, projected.callId)
  const existingCall = findCall(state, input.environment, projected.callId)
  if (existingReceipt && existingReceipt.rawBodyHash === hash) {
    return {
      state,
      status: 204,
      body: "",
      log: log({
        event: projected.projected.event,
        callId: projected.callId,
        outcome: "duplicate",
        notificationStatus: notificationStatus(existingCall?.record),
      }),
    }
  }
  if (existingReceipt) {
    const receipts = state.receipts.map((receipt) =>
      receipt === existingReceipt ? { ...receipt, conflicts: [...receipt.conflicts, hash] } : receipt,
    )
    return {
      state: { ...state, receipts },
      status: 204,
      body: "",
      log: log({
        event: projected.projected.event,
        callId: projected.callId,
        outcome: "conflict",
        notificationStatus: notificationStatus(existingCall?.record),
      }),
    }
  }

  const tenant = resolve({
    maps: input.maps,
    environment: input.environment,
    toNumber: projected.projected.toNumber,
    agentId: projected.projected.agentId,
  })
  const receipt: EventReceipt = {
    environment: input.environment,
    event: projected.projected.event,
    callId: projected.callId,
    rawBodyHash: hash,
    conflicts: [],
  }
  if (!tenant.ok) {
    return {
      state: putReceipt(state, receipt),
      status: 204,
      body: "",
      log: log({ event: projected.projected.event, callId: projected.callId, outcome: "unknown_tenant" }),
    }
  }
  if (existingCall && existingCall.record.lead.tenantLocationId !== tenant.tenant.locationId) {
    return {
      state: putReceipt(state, receipt),
      status: 204,
      body: "",
      log: log({ event: projected.projected.event, callId: projected.callId, outcome: "unknown_tenant" }),
    }
  }

  if (projected.projected.event === "call_started") {
    return {
      state: putReceipt(state, receipt),
      status: 204,
      body: "",
      log: log({ event: "call_started", callId: projected.callId, outcome: "accepted" }),
    }
  }

  const next = applyProjectedEvent(existingCall?.record ?? null, projected.projected, tenant.tenant, input.environment, input.nowIso)
  if (!next) {
    return {
      state: putReceipt(state, receipt),
      status: 204,
      body: "",
      log: log({ event: projected.projected.event, callId: projected.callId, outcome: "accepted" }),
    }
  }
  return {
    state: putReceipt(putCall(state, input.environment, next), receipt),
    status: 204,
    body: "",
    log: log({ event: projected.projected.event, callId: projected.callId, outcome: "accepted" }),
  }
}

export function settleNotification(state: VoiceState, environment: VoiceEnvironment, callId: string): VoiceState {
  return {
    ...state,
    calls: state.calls.map((call) => {
      if (call.environment !== environment || call.record.lead.providerCallRef !== callId) return call
      return { ...call, record: ensureNotificationIntent(environment, call.record) }
    }),
  }
}

export function runFallback(state: VoiceState, environment: VoiceEnvironment, callId: string): VoiceState {
  return {
    ...state,
    calls: state.calls.map((call) => {
      if (call.environment !== environment || call.record.lead.providerCallRef !== callId) return call
      return { ...call, record: finaliseWithoutAnalysis(environment, call.record) }
    }),
  }
}

export function markNotificationFailed(state: VoiceState, environment: VoiceEnvironment, callId: string): VoiceState {
  return {
    ...state,
    calls: state.calls.map((call) => {
      if (call.environment !== environment || call.record.lead.providerCallRef !== callId) return call
      return { ...call, record: markIntentFailed(call.record) }
    }),
  }
}

export function listLeads(state: VoiceState, businessId: string) {
  return state.calls.filter((call) => call.record.lead.tenantBusinessId === businessId).map((call) => call.record.lead)
}
