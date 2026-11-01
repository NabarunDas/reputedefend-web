"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { replaceAuthenticatedDocument } from "@/lib/portal/account/document"
import { INVITED_LOGIN_MESSAGE, INVITED_LOGIN_UNAVAILABLE, PORTAL_UNAVAILABLE, PORTAL_VERIFY_ERROR } from "@/lib/portal/email"
import { CUSTOMER_OTP_PATTERN } from "@/lib/otp"
import { OtpInput } from "../../otp-input"

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
  const payload = await response.json().catch(() => null) as { message?: string; status?: string } | null
  return { ok: response.ok, status: response.status, payload }
}

/**
 * First-time invitation sign-in. The token is posted to the server and is not
 * rendered. The screen never shows an email address or a business name.
 */
export function InvitedLoginClient({ token, preview }: {
  token: string
  preview?: {
    phase?: "start" | "code" | "done"
    code?: string
    error?: string
    resendIn?: number
    pending?: "" | "send" | "resend" | "verify"
  }
}) {
  const [phase, setPhase] = useState<"start" | "code" | "done">(preview?.phase ?? "start")
  const [code, setCode] = useState(preview?.code ?? "")
  const [error, setError] = useState(preview?.error ?? "")
  const [pending, setPending] = useState<"" | "send" | "resend" | "verify">(preview?.pending ?? "")
  const [resendIn, setResendIn] = useState(preview?.resendIn ?? 0)
  const codeInput = useRef<HTMLInputElement>(null)
  const busy = pending !== ""

  useEffect(() => {
    if (phase === "code") codeInput.current?.focus()
  }, [phase])

  useEffect(() => {
    if (phase !== "done" || preview) return
    replaceAuthenticatedDocument("portal")
  }, [phase, preview])

  useEffect(() => {
    if (preview || resendIn <= 0) return
    const timer = window.setInterval(() => setResendIn(current => (current > 0 ? current - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [preview, resendIn])

  async function sendCode(event: FormEvent) {
    event.preventDefault()
    setError("")
    setPending("send")
    try {
      const result = await postJson("/api/portal/auth/invite/start", { token })
      if (!result.ok) {
        setError(INVITED_LOGIN_UNAVAILABLE)
        return
      }
      setCode("")
      setPhase("code")
      setResendIn(60)
    } catch {
      setError(PORTAL_UNAVAILABLE)
    } finally {
      setPending("")
    }
  }

  async function resend() {
    if (resendIn > 0 || busy) return
    setError("")
    setPending("resend")
    try {
      const result = await postJson("/api/portal/auth/invite/resend", {})
      if (!result.ok) setError(PORTAL_UNAVAILABLE)
      else setResendIn(60)
    } catch {
      setError(PORTAL_UNAVAILABLE)
    } finally {
      setPending("")
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    setError("")
    if (!CUSTOMER_OTP_PATTERN.test(code)) return
    setPending("verify")
    try {
      const result = await postJson("/api/portal/auth/invite/verify", { code })
      if (!result.ok || result.payload?.status !== "ok") {
        setError(PORTAL_VERIFY_ERROR)
        return
      }
      setPhase("done")
    } catch {
      setError(PORTAL_VERIFY_ERROR)
    } finally {
      setPending("")
    }
  }

  if (phase === "done") {
    return <section className="auth-card" data-phase="done">
      <InvitationSteps current="code" />
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>You&apos;re signed in</h1>
      <p className="auth-done" role="status">Opening your customer space.</p>
    </section>
  }

  if (phase === "start") {
    return <section className="auth-card" data-phase="start">
      <InvitationSteps current="start" />
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Sign in with your invitation</h1>
      <p className="lead">We&apos;ll email an eight-digit code. This page does not sign you in by itself.</p>
      <form onSubmit={sendCode} aria-busy={pending === "send"}>
        {error ? <p className="notice-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{pending === "send" ? "Sending code…" : "Email me a sign-in code"}</button>
      </form>
      <p className="auth-note">Secure passwordless sign-in.</p>
    </section>
  }

  return <section className="auth-card" data-phase="code">
    <InvitationSteps current="code" />
    <p className="eyebrow">CUSTOMER PORTAL</p>
    <h1>Check your email</h1>
    <p className="lead" role="status">{INVITED_LOGIN_MESSAGE}</p>
    <form onSubmit={verify} aria-busy={pending === "verify"}>
      <label htmlFor="invited-portal-code">Eight-digit code</label>
      <OtpInput id="invited-portal-code" value={code} onChange={setCode} inputRef={codeInput} invalid={Boolean(error)} describedBy={error ? "invited-code-error" : undefined} />
      {error ? <p id="invited-code-error" className="notice-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy || !CUSTOMER_OTP_PATTERN.test(code)}>{pending === "verify" ? "Verifying…" : "Verify and sign in"}</button>
    </form>
    <div className="button-row">
      <button type="button" className="secondary" disabled={busy || resendIn > 0} onClick={resend}>
        {resendIn > 0 ? <>Resend code (<span className="auth-count">{resendIn}</span>)</> : "Resend code"}
      </button>
    </div>
  </section>
}

function InvitationSteps({ current }: { current: "start" | "code" }) {
  return (
    <ol className="auth-steps" aria-label="Sign-in steps">
      <li {...(current === "start" ? { "aria-current": "step" as const } : {})}>Invitation</li>
      <li {...(current === "code" ? { "aria-current": "step" as const } : {})}>Code</li>
    </ol>
  )
}
