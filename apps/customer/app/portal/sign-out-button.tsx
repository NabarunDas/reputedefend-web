"use client"
import { useState } from "react"

export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function signOut() {
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/portal/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin",
      })
      if (!response.ok) {
        setError("We couldn't sign you out. Try again.")
        return
      }
      window.location.assign("/login")
    } catch {
      setError("We couldn't sign you out. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return <>
    {error ? <p className="notice-danger" role="alert">{error}</p> : null}
    <button type="button" onClick={signOut} disabled={busy}>Sign out</button>
  </>
}
