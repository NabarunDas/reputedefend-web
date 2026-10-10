"use client"
import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { PORTAL_EMAIL_INVALID, PORTAL_UNAVAILABLE, PORTAL_VERIFY_ERROR, normalizePortalEmail, portalLoginNotice } from "@/lib/portal/email"
import { CUSTOMER_OTP_DIGITS, CUSTOMER_OTP_PATTERN, normalizeCustomerOtp } from "@/lib/otp"

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

export function LoginClient() {
  const router = useRouter()
  const [phase, setPhase] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [typedEmail, setTypedEmail] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState<"" | "send" | "resend" | "verify">("")
  const [resendIn, setResendIn] = useState(0)
  const busy = pending !== ""

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setInterval(() => setResendIn(current => (current > 0 ? current - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [resendIn])

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
      router.push("/portal")
    } catch {
      setError(PORTAL_VERIFY_ERROR)
    } finally {
      setPending("")
    }
  }

  if (phase === "email") {
    return <section className="auth-card">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Sign in to your ProfileRelaunch account</h1>
      <p className="lead">Use the email address verified with ProfileRelaunch. We&apos;ll send you a eight-digit code. You do not need a password.</p>
      <form onSubmit={sendCode}>
        <label htmlFor="portal-email">Email address</label>
        <input id="portal-email" name="email" type="email" autoComplete="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} required />
        {error ? <p className="notice-danger" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{pending === "send" ? "Sending code…" : "Send code"}</button>
      </form>
      <p className="auth-note">Secure passwordless sign-in.</p>
    </section>
  }

  return <section className="auth-card">
    <p className="eyebrow">CUSTOMER PORTAL</p>
    <h1>Check your email</h1>
    <p className="lead" role="status">{portalLoginNotice(typedEmail)}</p>
    <form onSubmit={verify}>
      <div className="otp-field">
        <label htmlFor="portal-code">Eight-digit code</label>
        <input
          id="portal-code"
          className="otp-input"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CUSTOMER_OTP_DIGITS}
          value={code}
          onChange={event => setCode(normalizeCustomerOtp(event.target.value))}
          required
        />
      </div>
      {error ? <p className="notice-danger" role="alert">{error}</p> : null}
      <button type="submit" disabled={busy || !CUSTOMER_OTP_PATTERN.test(code)}>{pending === "verify" ? "Verifying…" : "Verify and sign in"}</button>
    </form>
    <div className="button-row">
      <button type="button" className="secondary" disabled={busy || resendIn > 0} onClick={resend}>
        {resendIn > 0 ? `Resend code (${resendIn})` : "Resend code"}
      </button>
      <button type="button" className="secondary" onClick={() => { setPhase("email"); setCode(""); setError(""); setResendIn(0) }}>
        Use a different email
      </button>
    </div>
  </section>
}
