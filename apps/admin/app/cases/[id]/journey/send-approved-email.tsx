"use client"

/**
 * Keep the operator in Step 3. Approval freezes the reviewed snapshot; the
 * explicit send action queues that exact version, then invokes DEV's existing
 * fenced SEND_EMAIL worker for the single queued communication.
 *
 * Both APIs independently verify staff/session, email readiness, case binding,
 * version and job idempotency. No provider call is made unless queueing succeeds.
 */
import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

type Phase = "ready" | "busy" | "finished" | "uncertain"

type CommandReply = { ok: boolean; status: number; message: string }

async function post(url: string, body: Record<string, unknown>, idempotencyKey: string): Promise<CommandReply> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({})) as { message?: string }
  return { ok: response.ok, status: response.status, message: data.message || "" }
}

export function SendApprovedEvidenceEmail({
  caseId, communicationId, version, recipient, state, devSendManually,
}: {
  caseId: string
  communicationId: string
  version: number
  recipient: string
  state: "reviewed" | "queued"
  devSendManually: boolean
}) {
  const router = useRouter()
  const inflight = useRef(false)
  const keys = useRef<{ queue?: string; send?: string }>({})
  const [phase, setPhase] = useState<Phase>("ready")
  const [status, setStatus] = useState("")

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inflight.current || phase !== "ready") return
    inflight.current = true
    setPhase("busy")
    setStatus("")
    let queued = state === "queued"

    try {
      if (!queued) {
        keys.current.queue ||= crypto.randomUUID()
        const result = await post("/api/operations/communications", {
          operation: "queue",
          communicationId,
          version,
        }, keys.current.queue)
        if (!result.ok) {
          // A conflict or failed response can mean the queue command committed.
          // Never start a provider call or retry blindly before reading it back.
          setStatus(result.message || "We couldn't confirm whether this email was queued. Reload to check its status.")
          setPhase("uncertain")
          return
        }
        queued = true
      }

      if (!devSendManually) {
        setStatus("The approved email has been queued for sending. Delivery is not yet confirmed.")
        setPhase("finished")
        router.refresh()
        return
      }

      // The approved Send click also confirms this single queued DEV email.
      // DEV server-side safeguards require a recent OTP and protect against
      // replay, concurrent claims, provider uncertainty and double delivery.
      keys.current.send ||= crypto.randomUUID()
      const result = await post("/api/operations/dev-send-email", {
        communicationId,
        confirmed: true,
      }, keys.current.send)

      if (!result.ok) {
        setStatus(`${result.message || "The sending attempt could not be confirmed."} The email is queued, but provider acceptance is not confirmed. Reload this step to check its status; do not send another copy.`)
        setPhase("uncertain")
        return
      }

      setStatus("The approved email has been processed. Check the recorded provider status; acceptance is not proof of inbox delivery.")
      setPhase("finished")
      router.refresh()
    } catch {
      setStatus(queued
        ? "The email was queued, but its sending status is uncertain. Reload this step and check the recorded status before any further action."
        : "The queue result is uncertain. Reload this step to check whether the email was queued before sending.")
      setPhase("uncertain")
    } finally {
      inflight.current = false
    }
  }

  return <form className="record-form" onSubmit={send}>
    <p><strong>{state === "reviewed" ? "Ready to send" : "Queued — awaiting sending"}</strong></p>
    <p>Recipient: {recipient}. {state === "reviewed"
      ? "This sends the exact approved email. It cannot be edited during sending."
      : "This message is already queued; process only this queued email."}</p>
    <fieldset disabled={phase !== "ready"}>
      <button type="submit">{phase === "busy"
        ? "Processing…"
        : state === "reviewed"
          ? "Send approved email"
          : "Send queued email"}</button>
    </fieldset>
    {status && <p role="status">{status}</p>}
    {(phase === "uncertain" || phase === "finished") && <div className="email-actions">
      <button type="button" onClick={() => window.location.reload()}>Reload email status</button>
      <a href={`/cases/${caseId}/communications`}>View communication history</a>
    </div>}
  </form>
}
