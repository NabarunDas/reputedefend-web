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
  onLocalEnd?: () => void
}

// The placeholder is not a provider credential. The adapter below is the only
// call-creation path, and it talks to our authenticated command.
const sessionPlaceholder = "session"

export function startControlledReceptionistCall(input: StartControlledCall): { end: () => void; release: () => void } {
  let session: WebCallSession | null = null
  let timer: number | undefined
  let closed = false
  let serverSettled = false
  let localEndNotified = false
  let connected = false
  let activeCallId = ""
  const unresolved = "We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation."
  const releaseLocal = () => {
    if (timer !== undefined) window.clearTimeout(timer)
    void session?.end()
  }
  const noteLocalEnd = () => {
    if (!connected || serverSettled || localEndNotified || closed) return
    localEndNotified = true
    input.onLocalEnd?.()
  }
  const forwardStop = async (lookupId: string) => {
    let message = unresolved
    let status = 409
    let payloadStatus = ""
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(input.cancelEndpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
        body: JSON.stringify({ ...input.body, providerCallId: lookupId }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; status?: string } | null
      message = typeof payload?.message === "string" ? payload.message : unresolved
      status = response.status
      payloadStatus = typeof payload?.status === "string" ? payload.status : ""
      if (payloadStatus === "pending" && attempt < 3) {
        await new Promise(resolve => window.setTimeout(resolve, 200))
        continue
      }
      const completed = response.ok && payloadStatus === "completed"
      return { completed, message, status, payloadStatus }
    }
    return { completed: false, message, status, payloadStatus }
  }
  const release = () => {
    if (closed) return
    closed = true
    const callId = activeCallId
    if (callId && !serverSettled) {
      void fetch(input.cancelEndpoint, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
        body: JSON.stringify({ ...input.body, providerCallId: callId }),
      }).catch(() => undefined)
    }
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
          const result = await forwardStop(callId)
          if (result.completed) {
            serverSettled = true
            input.onStatus("ended")
          } else if (result.payloadStatus !== "stopping") {
            input.onStatus("error")
            input.onError(new Error(result.message))
          }
        } catch {
          input.onStatus("error")
          input.onError(new Error(unresolved))
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
      const stopMatch = path.match(/\/v2\/stop-call\/([^/]+)$/)
      if (init?.method === "POST" && stopMatch) {
        const lookupId = decodeURIComponent(stopMatch[1] ?? "")
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(lookupId)) {
          return jsonResponse({ message: "That call reference is not the controlled test recorded for this action." }, 409)
        }
        try {
          const result = await forwardStop(lookupId)
          if (result.completed) {
            serverSettled = true
            input.onStatus("ended")
            return jsonResponse({ status: "completed", message: result.message }, 200)
          }
          if (!serverSettled && result.payloadStatus !== "stopping") {
            input.onStatus("error")
            input.onError(new Error(result.message))
          }
          return jsonResponse({ message: result.message, status: result.payloadStatus }, result.status >= 400 ? result.status : 409)
        } catch {
          if (!serverSettled) {
            input.onStatus("error")
            input.onError(new Error(unresolved))
          }
          return jsonResponse({ message: unresolved }, 503)
        }
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
        else if (status === "live") {
          connected = true
          input.onStatus("connected")
        } else if (status === "ended") noteLocalEnd()
      },
      onEnd: () => noteLocalEnd(),
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
