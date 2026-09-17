"use client"
import { useState } from "react"
export function SignOut() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function leave(all: boolean) {
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch(all ? "/auth/logout-all" : "/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      if (response.ok) { window.location.replace("/login"); return }
      setMessage((await response.json()).message)
    } catch { setMessage("We couldn’t sign you out. Please try again.") }
    finally { setBusy(false) }
  }
  return <div className="sign-out">
    <button disabled={busy} onClick={() => void leave(false)}>Sign out</button>
    <button className="secondary" disabled={busy} onClick={() => void leave(true)}>Sign out all devices</button>
    <p role="status">{message}</p>
  </div>
}
