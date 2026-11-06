import "server-only"

export type AgentTestLane = "dev" | "production"

export type RetrievedAgentCall = {
  agentId: string | null
  agentVersion: number | null
  agentVersionQuality: "present" | "missing" | "malformed"
  availability: "retrieved" | "not_found" | "unavailable" | "incomplete"
  callId: string
  callStatus: "ended" | "error" | "ongoing" | "registered" | "unknown" | null
  callType: "web_call" | "phone_call" | "unknown" | null
  disconnectionReason: string | null
  endedAt: string | null
  environment: AgentTestLane
  providerError: boolean
  startedAt: string | null
  testScope: "AGENT_DIRECT"
}

export type AgentTestRetrieval =
  | { availability: "uncertain" }
  | { availability: "unavailable"; evidence: RetrievedAgentCall }
  | { availability: "not_found"; evidence: RetrievedAgentCall }
  | { availability: "incomplete"; evidence: RetrievedAgentCall }
  | { availability: "retrieved"; evidence: RetrievedAgentCall }

const callIdPattern = /^[A-Za-z0-9_-]{8,128}$/
const agentPattern = /^[A-Za-z0-9_-]{8,128}$/
const reasonPattern = /^[a-z0-9_]{1,64}$/
const lookupWindowMs = 60_000
const lookupLimit = 6
const createLimit = 3
const lookupTimeoutMs = 4_000
const lookups = new Map<string, number[]>()
const creates = new Map<string, number[]>()

export function resetAgentTestLookups() {
  lookups.clear()
  creates.clear()
}

export function allowAgentTestLookup(operatorId: string, now = Date.now()): boolean {
  const recent = (lookups.get(operatorId) ?? []).filter(time => now - time < lookupWindowMs)
  if (recent.length >= lookupLimit) {
    lookups.set(operatorId, recent)
    return false
  }
  recent.push(now)
  lookups.set(operatorId, recent)
  return true
}

export function allowAgentTestCreate(operatorId: string, now = Date.now()): boolean {
  const recent = (creates.get(operatorId) ?? []).filter(time => now - time < lookupWindowMs)
  if (recent.length >= createLimit) {
    creates.set(operatorId, recent)
    return false
  }
  recent.push(now)
  creates.set(operatorId, recent)
  return true
}

export function telloyaVoiceApiKey(lane: AgentTestLane): string | null {
  const value = lane === "production"
    ? process.env.TELLOYA_RETELL_PRODUCTION_API_KEY
    : process.env.TELLOYA_RETELL_DEV_API_KEY
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 8 || trimmed !== value) return null
  return trimmed
}

function blank(callId: string, lane: AgentTestLane, availability: RetrievedAgentCall["availability"]): RetrievedAgentCall {
  return {
    agentId: null,
    agentVersion: null,
    agentVersionQuality: "missing",
    availability,
    callId,
    callStatus: null,
    callType: null,
    disconnectionReason: null,
    endedAt: null,
    environment: lane,
    providerError: false,
    startedAt: null,
    testScope: "AGENT_DIRECT",
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() === value && value.length > 0 ? value : null
}

function instant(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function agentVersion(value: unknown): { quality: RetrievedAgentCall["agentVersionQuality"]; version: number | null } {
  if (value === undefined || value === null) return { quality: "missing", version: null }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999) {
    return { quality: "present", version: value }
  }
  return { quality: "malformed", version: null }
}

function project(body: Record<string, unknown>, callId: string, lane: AgentTestLane): RetrievedAgentCall | null {
  if (text(body.call_id) !== callId) return null
  const agent = text(body.agent_id)
  const version = agentVersion(body.agent_version)
  const status = text(body.call_status)
  const type = text(body.call_type)
  const reason = text(body.disconnection_reason)?.toLowerCase() ?? null
  const callStatus = status === "ended" || status === "error" || status === "ongoing" || status === "registered" ? status : status ? "unknown" : null
  const callType = type === "web_call" || type === "phone_call" ? type : type ? "unknown" : null
  return {
    agentId: agent && agentPattern.test(agent) ? agent : null,
    agentVersion: version.version,
    agentVersionQuality: version.quality,
    availability: "retrieved",
    callId,
    callStatus,
    callType,
    disconnectionReason: reason && reasonPattern.test(reason) ? reason : null,
    endedAt: instant(body.end_timestamp),
    environment: lane,
    providerError: callStatus === "error" || Boolean(reason?.startsWith("error")),
    startedAt: instant(body.start_timestamp),
    testScope: "AGENT_DIRECT",
  }
}

export async function retrieveAgentTestCall(input: {
  callId: string
  lane: AgentTestLane
  fetchImpl?: typeof fetch
}): Promise<AgentTestRetrieval> {
  if (!callIdPattern.test(input.callId)) return { availability: "incomplete", evidence: blank(input.callId || "unknownid", input.lane, "incomplete") }
  const apiKey = telloyaVoiceApiKey(input.lane)
  if (!apiKey) return { availability: "unavailable", evidence: blank(input.callId, input.lane, "unavailable") }
  const endpoint = new URL(`https://api.retellai.com/v2/get-call/${encodeURIComponent(input.callId)}`)
  try {
    const response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(lookupTimeoutMs),
    })
    if (response.status === 404) return { availability: "not_found", evidence: blank(input.callId, input.lane, "not_found") }
    if (response.status === 408 || response.status === 429 || response.status >= 500) return { availability: "uncertain" }
    if (response.status === 401 || response.status === 403) return { availability: "unavailable", evidence: blank(input.callId, input.lane, "unavailable") }
    if (!response.ok) return { availability: "incomplete", evidence: blank(input.callId, input.lane, "incomplete") }
    const body = await response.json() as unknown
    if (!body || typeof body !== "object" || Array.isArray(body)) return { availability: "incomplete", evidence: blank(input.callId, input.lane, "incomplete") }
    const evidence = project(body as Record<string, unknown>, input.callId, input.lane)
    if (!evidence) return { availability: "incomplete", evidence: blank(input.callId, input.lane, "incomplete") }
    return { availability: "retrieved", evidence }
  } catch {
    return { availability: "uncertain" }
  }
}

export type CreatedAgentWebCall =
  | { availability: "uncertain" }
  | { availability: "rejected" }
  | {
      availability: "created"
      callId: string
      accessToken: string
      transport: "gateway"
      expiresAt: string
    }

const createWebCallEndpoint = "https://api.retellai.com/v3/create-web-call"

function createdCall(body: Record<string, unknown>, agentId: string, agentVersion: number): CreatedAgentWebCall {
  const callId = text(body.call_id)
  const accessToken = text(body.access_token)
  const transport = text(body.transport)
  const expires = body.expires_at
  if (!callId || !callIdPattern.test(callId)) return { availability: "rejected" }
  if (!accessToken || accessToken.length < 16 || accessToken.length > 4096) return { availability: "rejected" }
  if (transport !== "gateway") return { availability: "rejected" }
  if (!Array.isArray(body.ice_servers) || body.ice_servers.length < 1) return { availability: "rejected" }
  if (typeof expires !== "number" || !Number.isSafeInteger(expires) || expires <= 0) return { availability: "rejected" }
  const echoedAgent = text(body.agent_id)
  if (echoedAgent && echoedAgent !== agentId) return { availability: "rejected" }
  const echoedVersion = agentVersionValue(body.agent_version)
  if (echoedVersion !== undefined && echoedVersion !== agentVersion) return { availability: "rejected" }
  const expiresAt = new Date(expires).toISOString()
  if (Number.isNaN(Date.parse(expiresAt))) return { availability: "rejected" }
  return { availability: "created", callId, accessToken, transport: "gateway", expiresAt }
}

function agentVersionValue(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 999_999_999) return value
  return Number.NaN
}

export async function createAgentWebCall(input: {
  agentId: string
  agentVersion: number
  lane: AgentTestLane
  fetchImpl?: typeof fetch
}): Promise<CreatedAgentWebCall> {
  if (!agentPattern.test(input.agentId)) return { availability: "rejected" }
  if (!Number.isSafeInteger(input.agentVersion) || input.agentVersion < 0 || input.agentVersion > 999_999_999) {
    return { availability: "rejected" }
  }
  const apiKey = telloyaVoiceApiKey(input.lane)
  if (!apiKey) return { availability: "rejected" }
  try {
    const response = await (input.fetchImpl ?? fetch)(createWebCallEndpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ agent_id: input.agentId, agent_version: input.agentVersion }),
      redirect: "error",
      signal: AbortSignal.timeout(lookupTimeoutMs),
    })
    if (response.status === 408 || response.status === 429 || response.status >= 500) return { availability: "uncertain" }
    if (response.status !== 200 && response.status !== 201) return { availability: "rejected" }
    const body = await response.json() as unknown
    if (!body || typeof body !== "object" || Array.isArray(body)) return { availability: "rejected" }
    return createdCall(body as Record<string, unknown>, input.agentId, input.agentVersion)
  } catch {
    return { availability: "uncertain" }
  }
}
