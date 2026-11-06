"use client"

import { RetellClient, type WebCallSession } from "retell-client-js-sdk"

export type ControlledCallPhase = "connecting" | "connected" | "ended" | "error"
export type ControlledCallOutcome = "accepted" | "rejected" | "reconciliation"

type StartControlledCall = {
  endpoint: string
  idempotencyKey: string
  body: Record<string, unknown>
  onStatus: (phase: ControlledCallPhase) => void
  onError: (error: Error) => void
  onOutcome: (outcome: ControlledCallOutcome) => void
  onCall: (call: { callId: string; maxDurationSeconds: number }) => void
}

// The placeholder is not a provider credential. The adapter below is the only
// call-creation path, and it talks to our authenticated command.
const sessionPlaceholder = "session"

export function startControlledReceptionistCall(input: StartControlledCall): { end: () => void } {
  let session: WebCallSession | null = null
  let timer: number | undefined
  let closed = false
  const end = () => {
    if (closed) return
    closed = true
    if (timer !== undefined) window.clearTimeout(timer)
    void session?.end()
  }
  const client = new RetellClient({
    key: sessionPlaceholder,
    fetch: async (url, init) => {
      const path = new URL(String(url), "https://provider.invalid").pathname
      if (init?.method === "POST" && path.endsWith("/v3/create-web-call")) {
        let response: Response
        try {
          response = await fetch(input.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
            body: JSON.stringify(input.body),
          })
        } catch (error) {
          input.onOutcome("reconciliation")
          throw error instanceof Error ? error : new Error("The browser could not reach the controlled test.")
        }
        const payload = await response.json().catch(() => null) as Record<string, unknown> | null
        if (!response.ok) {
          input.onOutcome(response.status === 502 ? "rejected" : "reconciliation")
          const message = typeof payload?.message === "string" ? payload.message : "A controlled web call was not opened."
          return jsonResponse({ message }, response.status)
        }
        const callId = typeof payload?.callId === "string" ? payload.callId : ""
        const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken : ""
        const iceServers = Array.isArray(payload?.iceServers) ? payload.iceServers : []
        const expiresAt = typeof payload?.expiresAt === "string" ? Date.parse(payload.expiresAt) : Date.now() + 600_000
        const maxDurationSeconds = typeof payload?.maxDurationSeconds === "number" ? payload.maxDurationSeconds : 600
        if (!callId || accessToken.length < 16 || iceServers.length < 1 || payload?.transport !== "gateway") {
          input.onOutcome("reconciliation")
          return jsonResponse({ message: "The controlled web call did not return a connection." }, 502)
        }
        input.onOutcome("accepted")
        input.onCall({ callId, maxDurationSeconds })
        timer = window.setTimeout(() => end(), maxDurationSeconds * 1000)
        return jsonResponse({
          call_id: callId,
          access_token: accessToken,
          transport: "gateway",
          ice_servers: iceServers,
          expires_at: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 600_000,
        }, 201)
      }
      if (path.includes("/stop-call")) return new Response(null, { status: 204 })
      input.onOutcome("reconciliation")
      return jsonResponse({ message: "That provider request is not available from the browser." }, 403)
    },
  })
  session = client.createWebCall({
    agent_id: "configured",
    transcript: false,
    hooks: {
      onStatus: status => {
        if (status === "connecting") input.onStatus("connecting")
        else if (status === "live") input.onStatus("connected")
        else if (status === "ended") input.onStatus("ended")
      },
      onEnd: () => input.onStatus("ended"),
      onError: error => {
        input.onStatus("error")
        input.onError(error)
      },
    },
  })
  return { end }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
