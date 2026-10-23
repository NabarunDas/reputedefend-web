"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import styles from "../confirm-email.module.css"

/** Client-only fragment store. The server snapshot is deliberately empty.
 * useSyncExternalStore safely reconciles the emailed bearer after hydration,
 * without synchronous setState inside an effect or reflecting it in SSR HTML.
 */
function useConfirmationToken() {
  const cached = useRef("")
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (cached.current) return cached.current
      const hash = window.location.hash
      if (hash.startsWith("#t=") && /^[0-9a-f]{64}$/.test(hash.slice(3))) {
        cached.current = hash.slice(3)
      }
      return cached.current
    },
    () => "",
  )
}

type Props = {
  challengeId: string
  canConfirm: boolean
  canResend: boolean
}

export function ConfirmEmailForm({ challengeId, canConfirm, canResend }: Props) {
  const token = useConfirmationToken()
  const [csrf, setCsrf] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Fragment tokens never reach the server during GET or appear in a
    // query string. Capture before clearing the fragment from the URL.
    const hash = window.location.hash
    if (hash) window.history.replaceState(null, "", window.location.pathname + window.location.search)

    // API GET merely sets a same-origin anti-CSRF cookie. It does not
    // verify the email. This API endpoint is also the subsequent POST path.
    let active = true
    void (async () => {
      try {
        const response = await fetch("/api/confirm-email", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
        })
        const data = await response.json() as { csrf?: unknown }
        if (active && response.ok && typeof data.csrf === "string" && /^[0-9a-f]{64}$/.test(data.csrf)) {
          setCsrf(data.csrf)
        } else if (active) {
          setMessage("We couldn't prepare your secure confirmation. Please reload this page.")
        }
      } catch {
        if (active) setMessage("We couldn't prepare your secure confirmation. Please reload this page.")
      }
    })()
    return () => { active = false }
  }, [])

  async function submit(action: "confirm" | "resend") {
    if (busy || done || !token || !csrf) return
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/confirm-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ challengeId, csrf, token, action }),
      })
      const data = await response.json() as { message?: string }
      setMessage(typeof data.message === "string" ? data.message : "Your assessment is already saved.")
      if (response.ok && action === "confirm") setDone(true)
      if (response.ok && action === "resend") setDone(true)
    } catch {
      setMessage("We couldn't complete that action. Your assessment is still saved. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => {
      event.preventDefault()
      void submit("confirm")
    }}>
      <div className={styles.actions}>
        {canConfirm && <button className={styles.button} type="submit" disabled={busy || done || !token || !csrf}>
          {busy ? "Confirming…" : "Confirm email"}
        </button>}
        {canResend && <button
          className={`${styles.button} ${styles.secondary}`}
          type="button"
          disabled={busy || done || !token || !csrf}
          onClick={() => void submit("resend")}
        >
          Resend confirmation
        </button>}
      </div>
      {(!token || !csrf) && <p className={styles.note}>Open the confirmation button in your email to continue. This page does not confirm an address on its own.</p>}
      {message && <p className={styles.note} role="status">{message}</p>}
    </form>
  )
}
