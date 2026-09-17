"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
export function RevokeSession({ id, label }: { id: string; label: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function revoke() {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/sessions/revoke", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: id }) })
      const result = await response.json()
      setMessage(result.message)
      if (response.ok) { setConfirming(false); router.refresh() }
    } catch { setMessage("We couldn’t confirm the change. Refresh the page before trying again.") }
    finally { setBusy(false) }
  }
  return <div className="session-action">
    {!confirming ? <button className="secondary" onClick={() => setConfirming(true)} aria-label={`End session signed in ${label}`}>End this session</button> : <>
      <p>Sign out the session started {label}?</p>
      <div className="button-row"><button disabled={busy} onClick={revoke}>{busy ? "Signing out…" : "Yes, end this session"}</button><button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </div>
}
