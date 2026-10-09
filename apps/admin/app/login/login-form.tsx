"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ADMIN_OTP_DIGITS } from "@/lib/auth/otp"
import { OtpInput } from "./otp-input"

export function LoginForm() {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  const busyRef = useRef(false)
  const autoSubmitted = useRef<string | null>(null)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  useEffect(() => { if (sent) codeInput.current?.focus() }, [sent])
  const submit = useCallback(async (action: "send" | "verify") => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage("")
    let refocus = false
    try {
      const response = await fetch(`/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "verify" ? { code } : {}) })
      const data = await response.json()
      setMessage(data.message)
      if (response.ok && action === "verify") {
        // Start a fresh document so the pre-auth router cache is discarded.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/")
        return
      }
      if (action === "verify") refocus = true
      if (response.ok && action === "send") {
        setSent(true)
        setCode("")
        autoSubmitted.current = null
        setCooldown(60)
        setMessage("A sign-in code has been sent to the registered admin email.")
      }
      if (response.status === 429 && action === "send") setCooldown(60)
    } catch {
      setMessage("We couldn’t reach the server. Check your connection and try again.")
      if (action === "verify") refocus = true
    } finally {
      busyRef.current = false
      setBusy(false)
      if (refocus) codeInput.current?.focus()
    }
  }, [code])
  useEffect(() => {
    if (!sent || code.length !== ADMIN_OTP_DIGITS) {
      if (code.length !== ADMIN_OTP_DIGITS) autoSubmitted.current = null
      return
    }
    if (busy || busyRef.current || autoSubmitted.current === code) return
    autoSubmitted.current = code
    void submit("verify")
  }, [sent, code, busy, submit])
  return <>
    <p>We’ll send a sign-in code to the registered admin email.</p>
    {sent && <form onSubmit={event => { event.preventDefault(); void submit("verify") }}>
      <label htmlFor="code">Eight-digit code</label>
      <OtpInput id="code" value={code} describedBy="code-help" onChange={setCode} inputRef={codeInput} />
      <p id="code-help" className="muted">Use your latest code within 10 minutes. You have five attempts.</p>
      <button type="submit" disabled={busy || code.length !== ADMIN_OTP_DIGITS}>{busy ? "Please wait…" : "Sign in"}</button>
    </form>}
    <button type="button" className={sent ? "secondary" : ""} disabled={busy || cooldown > 0} onClick={() => void submit("send")}>
      {cooldown > 0 ? `Send another code in ${cooldown}s` : busy ? "Please wait…" : sent ? "Send another code" : "Send sign-in code"}
    </button>
    <p role="status" aria-live="polite">{message}</p>
    <p className="muted">Check your spam folder if the email hasn’t arrived. Keep this tab open while you check your inbox.</p>
  </>
}
