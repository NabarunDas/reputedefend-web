"use client"

import { RetellClient, type WebCallSession } from "retell-client-js-sdk"

export type ControlledCallPhase = "connecting" | "connected" | "ended" | "error"
export type ControlledCallOutcome = "accepted" | "rejected" | "reconciliation"

type StartControlledCall = {
  endpoint: string
  cancelEndpoint: string
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

export function startControlledReceptionistCall(input: StartControlledCall): { end: () => void; release: () => void } {
  let session: WebCallSession | null = null
  let timer: number | undefined
  let closed = false
  let activeCallId = ""
  const releaseLocal = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    void session?.end()
  }
  const release = () => {
    if (closed) return
    closed = true
    releaseLocal()
  }
  const end = () => {
    if (closed) return
    closed = true
    if (timer !== undefined) window.clearTimeout(timer)
    const callId = activeCallId
    void (async () => {
      if (callId) {
        try {
          const response = await fetch(input.cancelEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
            body: JSON.stringify({ ...input.body, providerCallId: callId }),
          })
          const payload = await response.json().catch(() => null) as { message?: string } | null
          const message = typeof payload?.message === "string" ? payload.message : "We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation."
          if (!response.ok) {
            input.onStatus("error")
            input.onError(new Error(message))
          } else {
            input.onStatus("ended")
          }
        } catch {
          input.onStatus("error")
          input.onError(new Error("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation."))
        }
      }
      releaseLocal()
    })()
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
        activeCallId = callId
        timer = window.setTimeout(() => {
          if (closed) return
          closed = true
          input.onStatus("error")
          input.onError(new Error("The browser reached the time limit and left the audio connection. The controlled test stays open until the provider confirms it has ended. Another call was not started."))
          releaseLocal()
        }, maxDurationSeconds * 1000)
        return jsonResponse({
          call_id: callId,
          access_token: accessToken,
          transport: "gateway",
          ice_servers: iceServers,
          expires_at: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 600_000,
        }, 201)
      }
      if (path.includes("/stop-call")) {
        return jsonResponse({ message: "The browser cannot stop a provider call directly. Use the controlled end action." }, 409)
      }
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
  return { end, release }
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}
