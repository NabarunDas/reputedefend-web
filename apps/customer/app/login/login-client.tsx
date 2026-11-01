"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { replaceAuthenticatedDocument } from "@/lib/portal/account/document"
import { PORTAL_EMAIL_INVALID, PORTAL_UNAVAILABLE, PORTAL_VERIFY_ERROR, normalizePortalEmail, portalLoginNotice } from "@/lib/portal/email"
import { CUSTOMER_OTP_PATTERN } from "@/lib/otp"
import { OtpInput } from "./otp-input"

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
 * `preview` holds a painted sign-in phase for a local visual fixture.
 * The login page does not pass it, and it is not read from the request.
 */
export function LoginClient({ preview, sessionEnded = false }: {
  sessionEnded?: boolean
  preview?: {
    phase?: "email" | "code" | "done"
    email?: string
    code?: string
    error?: string
    resendIn?: number
    pending?: "" | "send" | "resend" | "verify"
  }
} = {}) {
  const [phase, setPhase] = useState<"email" | "code" | "done">(preview?.phase ?? "email")
  const [email, setEmail] = useState(preview?.email ?? "")
  const [typedEmail, setTypedEmail] = useState(preview?.phase === "email" ? "" : preview?.email ?? "")
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
    const typed = email.trim()
    if (!normalizePortalEmail(typed)) {
      setError(PORTAL_EMAIL_INVALID)
      return
    }
    setPending("send")
    try {
      const result = await postJson("/api/portal/auth/start", { email: typed })
      if (result.status === 400) {
        setError(PORTAL_EMAIL_INVALID)
        return
      }
      if (!result.ok) {
        setError(PORTAL_UNAVAILABLE)
        return
      }
      setTypedEmail(typed)
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
      const result = await postJson("/api/portal/auth/resend", {})
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
      const result = await postJson("/api/portal/auth/verify", { code })
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
      <SignInSteps current="code" />
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>You&apos;re signed in</h1>
      <p className="auth-done" role="status">Opening your customer space.</p>
    </section>
  }

  if (phase === "email") {
    return <section className="auth-card" data-phase="email">
      <SignInSteps current="email" />
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Sign in to your ProfileRelaunch account</h1>
      {sessionEnded && !preview ? <p className="notice-danger" role="status">Your session ended for security. Sign in again with a new email code.</p> : null}
      <p className="lead">Use the email address verified with ProfileRelaunch. We&apos;ll send you an eight-digit code. You do not need a password.</p>
      <form onSubmit={sendCode} aria-busy={pending === "send"}>
        <label htmlFor="portal-email">Email address</label>
        <input id="portal-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} required aria-invalid={error ? true : undefined} aria-describedby={error ? "portal-email-error" : undefined} />
        {error ? <p id="portal-email-error" className="notice-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{pending === "send" ? "Sending code…" : "Send code"}</button>
      </form>
      <p className="auth-note">Secure passwordless sign-in.</p>
    </section>
  }

  return <section className="auth-card" data-phase="code">
    <SignInSteps current="code" />
    <p className="eyebrow">CUSTOMER PORTAL</p>
    <h1>Check your email</h1>
    <p className="lead" role="status">{portalLoginNotice(typedEmail)}</p>
    <form onSubmit={verify} aria-busy={pending === "verify"}>
      <label htmlFor="portal-code">Eight-digit code</label>
      <OtpInput id="portal-code" value={code} onChange={setCode} inputRef={codeInput} invalid={Boolean(error)} describedBy={error ? "portal-code-error" : undefined} />
      {error ? <p id="portal-code-error" className="notice-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy || !CUSTOMER_OTP_PATTERN.test(code)}>{pending === "verify" ? "Verifying…" : "Verify and sign in"}</button>
    </form>
    <div className="button-row">
      <button type="button" className="secondary" disabled={busy || resendIn > 0} onClick={resend}>
        {resendIn > 0 ? <>Resend code (<span className="auth-count">{resendIn}</span>)</> : "Resend code"}
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setPhase("email"); setCode(""); setError(""); setResendIn(0) }}>
        Use a different email
      </button>
    </div>
  </section>
}

function SignInSteps({ current }: { current: "email" | "code" }) {
  return (
    <ol className="auth-steps" aria-label="Sign-in steps">
      <li {...(current === "email" ? { "aria-current": "step" as const } : {})}>Email</li>
      <li {...(current === "code" ? { "aria-current": "step" as const } : {})}>Code</li>
    </ol>
  )
}
