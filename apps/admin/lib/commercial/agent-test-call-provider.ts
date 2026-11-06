import "server-only"

export type AgentTestLane = "dev" | "production"

export type RetrievedAgentCall = {
  agentId: string | null
  agentVersion: string | null
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
const versionPattern = /^[A-Za-z0-9._-]{1,128}$/
const reasonPattern = /^[a-z0-9_]{1,64}$/

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

function project(body: Record<string, unknown>, callId: string, lane: AgentTestLane): RetrievedAgentCall | null {
  if (text(body.call_id) !== callId) return null
  const agent = text(body.agent_id)
  const versionSource = body.agent_version
  const version = typeof versionSource === "number" && Number.isInteger(versionSource)
    ? String(versionSource)
    : text(versionSource)
  const status = text(body.call_status)
  const type = text(body.call_type)
  const reason = text(body.disconnection_reason)?.toLowerCase() ?? null
  const callStatus = status === "ended" || status === "error" || status === "ongoing" || status === "registered" ? status : status ? "unknown" : null
  const callType = type === "web_call" || type === "phone_call" ? type : type ? "unknown" : null
  return {
    agentId: agent && agentPattern.test(agent) ? agent : null,
    agentVersion: version && versionPattern.test(version) ? version : null,
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
