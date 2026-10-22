"use client"

import { useEffect, useState } from "react"
import styles from "../confirm-email.module.css"

type Props = {
  challengeId: string
  csrf: string
  canConfirm: boolean
  canResend: boolean
}

export function ConfirmEmailForm({ challengeId, csrf, canConfirm, canResend }: Props) {
  const [token, setToken] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    const marker = "#t="
    const value = hash.startsWith(marker) ? hash.slice(marker.length) : ""
    if (value) setToken(value)
    if (hash) window.history.replaceState(null, "", window.location.pathname + window.location.search)
  }, [])

  async function submit(action: "confirm" | "resend") {
    if (busy || done || !token) return
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/confirm-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, csrf, token, action }),
      })
      const body = await response.json() as { message?: string }
      setMessage(typeof body.message === "string" ? body.message : "Your assessment is already saved.")
      if (response.ok && action === "confirm") setDone(true)
    } catch {
      setMessage("Your assessment is already saved. You do not need to submit it again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit("confirm")
      }}
    >
      <div className={styles.actions}>
        {canConfirm && (
          <button className={styles.button} type="submit" disabled={busy || done || !token}>
            {busy ? "Confirming…" : "Confirm email"}
          </button>
        )}
        {canResend && (
          <button
            className={`${styles.button} ${styles.secondary}`}
            type="button"
            disabled={busy || !token}
            onClick={() => void submit("resend")}
          >
            Resend confirmation
          </button>
        )}
      </div>
      {!token && <p className={styles.note}>Open the confirmation button in your email to continue. This page does not confirm an address on its own.</p>}
      {message && <p className={styles.note} role="status">{message}</p>}
    </form>
  )
}
