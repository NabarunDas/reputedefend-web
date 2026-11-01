"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { replaceExpiredPortalDocument } from "@/lib/portal/account/document"
import { PORTAL_ACTIVITY_DEBOUNCE_MS } from "@/lib/portal/idle-policy"
import { portalExpiryWarning, type PortalClock } from "@/lib/portal/idle"

type Deadlines = PortalClock & { lastActivityAt: string }

const CHECKING = "checking"

function markPortal(state: "checking" | "held") {
  document.documentElement.dataset.portalSession = state
  const root = document.querySelector(".portal-private")
  root?.setAttribute("inert", "")
  root?.setAttribute("aria-hidden", "true")
}

function concealPortal(generation: { current: number }) {
  generation.current += 1
  markPortal(CHECKING)
}

function holdPortal() {
  markPortal("held")
}

function revealPortal() {
  delete document.documentElement.dataset.portalSession
  const root = document.querySelector(".portal-private")
  root?.removeAttribute("inert")
  root?.removeAttribute("aria-hidden")
}

function sameInstant(left: string, right: string) {
  const a = Date.parse(left)
  const b = Date.parse(right)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1000
}

async function readJson(response: Response): Promise<Deadlines | null> {
  const payload = await response.json().catch(() => null) as Partial<Deadlines> | null
  if (!response.ok || !payload?.authenticatedAt || !payload.expiresAt || !payload.idleExpiresAt || !payload.lastActivityAt) return null
  return {
    authenticatedAt: payload.authenticatedAt,
    expiresAt: payload.expiresAt,
    lastActivityAt: payload.lastActivityAt,
    idleExpiresAt: payload.idleExpiresAt,
  }
}

/**
 * Warns before idle or absolute expiry and hides portal content until a
 * restoration check succeeds. Pointer and keyboard events in a visible tab
 * are the only automatic activity. Prefetch, polling, and a hidden tab are not.
 */
export function PortalIdleGuard() {
  const pathname = usePathname()
  const seenPath = useRef(pathname)
  const lastSent = useRef(0)
  const absoluteExpiry = useRef<string | null>(null)
  const generation = useRef(0)
  const [clock, setClock] = useState<Deadlines | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")

  function remember(next: Deadlines) {
    if (absoluteExpiry.current && !sameInstant(next.expiresAt, absoluteExpiry.current)) return false
    absoluteExpiry.current = next.expiresAt
    setClock(next)
    setError("")
    return true
  }

  function hold(message: string) {
    holdPortal()
    setChecking(false)
    setError(message)
  }

  async function confirmSession() {
    const ticket = generation.current
    try {
      const response = await fetch("/api/portal/auth/session", { method: "GET", credentials: "same-origin", cache: "no-store" })
      if (ticket !== generation.current) return
      if (response.status === 401) {
        replaceExpiredPortalDocument()
        return
      }
      const deadlines = await readJson(response)
      if (ticket !== generation.current) return
      if (!deadlines || !remember(deadlines)) {
        hold("We couldn't confirm your session. Refresh the page.")
        return
      }
      setChecking(false)
      revealPortal()
    } catch {
      if (ticket !== generation.current) return
      hold("We couldn't confirm your session. Refresh the page.")
    }
  }

  async function postActivity(force: boolean) {
    if (!force && document.visibilityState !== "visible") return
    const sentAt = Date.now()
    if (!force && sentAt - lastSent.current < PORTAL_ACTIVITY_DEBOUNCE_MS) return
    lastSent.current = sentAt
    try {
      const response = await fetch("/api/portal/auth/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin",
        cache: "no-store",
      })
      if (response.status === 401) {
        replaceExpiredPortalDocument()
        return
      }
      const deadlines = await readJson(response)
      if (!response.ok || !deadlines || !remember(deadlines)) {
        if (force) lastSent.current = 0
        if (force) setError("We couldn't confirm your session. Try again.")
        return
      }
    } catch {
      if (force) {
        lastSent.current = 0
        setError("We couldn't confirm your session. Try again.")
      }
    }
  }

  const confirmRef = useRef<() => Promise<void>>(async () => {})
  const postRef = useRef<(force: boolean) => Promise<void>>(async () => {})

  useEffect(() => {
    confirmRef.current = confirmSession
    postRef.current = postActivity
  })

  useEffect(() => {
    const started = window.setTimeout(() => { void confirmRef.current() }, 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(started)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (seenPath.current === pathname) return
    seenPath.current = pathname
    concealPortal(generation)
    const started = window.setTimeout(() => {
      setChecking(true)
      void confirmRef.current()
    }, 0)
    return () => window.clearTimeout(started)
  }, [pathname])

  useEffect(() => {
    function onActivity() {
      if (document.visibilityState !== "visible") return
      void postRef.current(false)
    }
    function onHide(event: PageTransitionEvent) {
      if (event.persisted) concealPortal(generation)
    }
    function onShow(event: PageTransitionEvent) {
      if (!event.persisted) return
      concealPortal(generation)
      setChecking(true)
      void confirmRef.current()
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return
      concealPortal(generation)
      setChecking(true)
      void confirmRef.current()
    }
    function onPopState() {
      concealPortal(generation)
      setChecking(true)
      void confirmRef.current()
    }
    document.addEventListener("pointerdown", onActivity)
    document.addEventListener("keydown", onActivity)
    window.addEventListener("pagehide", onHide)
    window.addEventListener("pageshow", onShow)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("popstate", onPopState)
    return () => {
      document.removeEventListener("pointerdown", onActivity)
      document.removeEventListener("keydown", onActivity)
      window.removeEventListener("pagehide", onHide)
      window.removeEventListener("pageshow", onShow)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("popstate", onPopState)
    }
  }, [])

  const warn = clock ? portalExpiryWarning(clock, now) : false
  if (checking || (!warn && !error)) return null

  return (
    <div className="portal-idle-warning" role="status">
      {error ? <p className="notice-danger" role="alert">{error}</p> : <p>Your session will end soon for security. Stay signed in if you are still here.</p>}
      {warn ? <button type="button" onClick={() => void postActivity(true)}>Stay signed in</button> : null}
    </div>
  )
}
