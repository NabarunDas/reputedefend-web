"use client"
import { useEffect, useRef, useState } from "react"

export function LoginForm() {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])
  useEffect(() => { if (sent) codeInput.current?.focus() }, [sent])
  async function submit(action: "send" | "verify") {
    if (busy) return
    setBusy(true)
    setMessage("")
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
      if (response.ok && action === "send") {
        setSent(true)
        setCode("")
        setCooldown(60)
        setMessage("A sign-in code has been sent to the registered admin email.")
      }
      if (response.status === 429 && action === "send") setCooldown(60)
    } catch { setMessage("We couldn’t reach the server. Check your connection and try again.") }
    finally { setBusy(false) }
  }
  return <>
    <p>We’ll send a sign-in code to the registered admin email.</p>
    {sent && <form onSubmit={event => { event.preventDefault(); void submit("verify") }}>
      <label htmlFor="code">Six-digit code</label>
      <input ref={codeInput} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required aria-describedby="code-help" />
      <p id="code-help" className="muted">Use your latest code within 10 minutes. You have five attempts.</p>
      <button type="submit" disabled={busy || code.length !== 6}>{busy ? "Please wait…" : "Sign in"}</button>
    </form>}
    <button type="button" className={sent ? "secondary" : ""} disabled={busy || cooldown > 0} onClick={() => void submit("send")}>
      {cooldown > 0 ? `Send another code in ${cooldown}s` : busy ? "Please wait…" : sent ? "Send another code" : "Send sign-in code"}
    </button>
    <p role="status" aria-live="polite">{message}</p>
    <p className="muted">Check your spam folder if the email hasn’t arrived. Keep this tab open while you check your inbox.</p>
  </>
}
