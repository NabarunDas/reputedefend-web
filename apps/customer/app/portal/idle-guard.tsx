"use client"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { replaceExpiredPortalDocument } from "@/lib/portal/account/document"
import { PORTAL_ACTIVITY_DEBOUNCE_MS } from "@/lib/portal/idle-policy"
import { portalDeadlineMs, portalExpiryWarning, type PortalClock } from "@/lib/portal/idle"

type Deadlines = PortalClock & { lastActivityAt: string }
type Phase = "open" | "checking" | "held"

const CHECKING = "checking"
const SESSION_URL = "/api/portal/auth/session"
const CONFIRM_FAILED = "We couldn't confirm your session. Try again."

function sensitiveNodes() {
  return [document.querySelector(".portal-private"), document.querySelector(".customer-header-context")]
}

function markPortal(state: "checking" | "held") {
  document.documentElement.dataset.portalSession = state
  for (const root of sensitiveNodes()) {
    root?.setAttribute("inert", "")
    root?.setAttribute("aria-hidden", "true")
  }
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
  for (const root of sensitiveNodes()) {
    root?.removeAttribute("inert")
    root?.removeAttribute("aria-hidden")
  }
}

function sameInstant(left: string, right: string) {
  const a = Date.parse(left)
  const b = Date.parse(right)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1000
}

function stillOpen(next: Deadlines, now = Date.now()) {
  const deadline = portalDeadlineMs(next)
  return deadline !== null && now < deadline
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
 * Warns before idle or absolute expiry. When either deadline passes with
 * nobody watching, portal content and the header name are concealed before a
 * single read-only session check. Pointer and keyboard events in a visible
 * tab are the only automatic activity. Prefetch, polling, the warning clock,
 * and a hidden tab are not.
 */
export function PortalIdleGuard() {
  const pathname = usePathname()
  const seenPath = useRef(pathname)
  const lastSent = useRef(0)
  const absoluteExpiry = useRef<string | null>(null)
  const generation = useRef(0)
  const redirected = useRef(false)
  const armedDeadline = useRef<number | null>(null)
  const flight = useRef<number | null>(null)
  const clockRef = useRef<Deadlines | null>(null)
  const [clock, setClock] = useState<Deadlines | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [phase, setPhase] = useState<Phase>("open")
  const [error, setError] = useState("")

  function acceptable(next: Deadlines) {
    if (absoluteExpiry.current && !sameInstant(next.expiresAt, absoluteExpiry.current)) return false
    return stillOpen(next)
  }

  function remember(next: Deadlines) {
    absoluteExpiry.current = next.expiresAt
    armedDeadline.current = null
    setClock(next)
    setError("")
  }

  function hold(message: string) {
    holdPortal()
    setPhase("held")
    setError(message)
  }

  function expireDocument() {
    if (redirected.current) return
    redirected.current = true
    replaceExpiredPortalDocument()
  }

  function beginConfirm() {
    if (redirected.current) return
    const ticket = generation.current
    if (flight.current === ticket) return
    flight.current = ticket
    void runConfirm(ticket)
  }

  async function runConfirm(ticket: number) {
    try {
      const response = await fetch(SESSION_URL, { method: "GET", credentials: "same-origin", cache: "no-store" })
      if (ticket !== generation.current || redirected.current) return
      if (response.status === 401) {
        expireDocument()
        return
      }
      const deadlines = await readJson(response)
      if (ticket !== generation.current || redirected.current) return
      if (!deadlines || !acceptable(deadlines)) {
        hold(CONFIRM_FAILED)
        return
      }
      remember(deadlines)
      setPhase("open")
      revealPortal()
    } catch {
      if (ticket !== generation.current || redirected.current) return
      hold(CONFIRM_FAILED)
    } finally {
      if (flight.current === ticket) flight.current = null
    }
  }

  async function postActivity(force: boolean) {
    if (redirected.current) return
    if (!force && document.visibilityState !== "visible") return
    const sentAt = Date.now()
    if (!force && sentAt - lastSent.current < PORTAL_ACTIVITY_DEBOUNCE_MS) return
    lastSent.current = sentAt
    const ticket = generation.current
    try {
      const response = await fetch("/api/portal/auth/activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin",
        cache: "no-store",
      })
      if (ticket !== generation.current || redirected.current) return
      if (response.status === 401) {
        expireDocument()
        return
      }
      const deadlines = await readJson(response)
      if (ticket !== generation.current || redirected.current) return
      if (!response.ok || !deadlines || !acceptable(deadlines)) {
        if (force) lastSent.current = 0
        if (force) setError(CONFIRM_FAILED)
        return
      }
      remember(deadlines)
    } catch {
      if (ticket !== generation.current || redirected.current) return
      if (force) {
        lastSent.current = 0
        setError(CONFIRM_FAILED)
      }
    }
  }

  function retry() {
    if (redirected.current) return
    concealPortal(generation)
    setPhase("checking")
    setError("")
    beginConfirm()
  }

  function armExpiry(deadline: number) {
    if (redirected.current) return
    if (armedDeadline.current === deadline) return
    const live = clockRef.current ? portalDeadlineMs(clockRef.current) : null
    if (live === null || live !== deadline) return
    armedDeadline.current = deadline
    concealPortal(generation)
    setPhase("checking")
    beginConfirm()
  }

  const confirmRef = useRef<() => void>(() => {})
  const postRef = useRef<(force: boolean) => Promise<void>>(async () => {})
  const expiryRef = useRef<(deadline: number) => void>(() => {})

  useEffect(() => {
    confirmRef.current = beginConfirm
    postRef.current = postActivity
    expiryRef.current = armExpiry
  })

  useEffect(() => {
    const started = window.setTimeout(() => { confirmRef.current() }, 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearTimeout(started)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    clockRef.current = clock
    const deadline = clock ? portalDeadlineMs(clock) : null
    if (deadline === null) return
    const delay = Math.max(0, deadline - Date.now())
    const timer = window.setTimeout(() => expiryRef.current(deadline), delay)
    return () => window.clearTimeout(timer)
  }, [clock])

  useEffect(() => {
    if (seenPath.current === pathname) return
    seenPath.current = pathname
    concealPortal(generation)
    const started = window.setTimeout(() => {
      setPhase("checking")
      confirmRef.current()
    }, 0)
    return () => window.clearTimeout(started)
  }, [pathname])

  useEffect(() => {
    function onActivity(event: Event) {
      if (document.visibilityState !== "visible") return
      const target = event.target
      if (target instanceof Element && target.closest(".portal-idle-warning")) return
      void postRef.current(false)
    }
    function onHide(event: PageTransitionEvent) {
      if (event.persisted) concealPortal(generation)
    }
    function onShow(event: PageTransitionEvent) {
      if (!event.persisted) return
      concealPortal(generation)
      setPhase("checking")
      confirmRef.current()
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return
      concealPortal(generation)
      setPhase("checking")
      confirmRef.current()
    }
    function onPopState() {
      concealPortal(generation)
      setPhase("checking")
      confirmRef.current()
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
  if (phase === "checking") return null
  if (phase === "held") {
    return (
      <div className="portal-idle-warning" role="status">
        <p className="notice-danger" role="alert">{error || CONFIRM_FAILED}</p>
        <button type="button" onClick={retry}>Try again</button>
      </div>
    )
  }
  if (!warn && !error) return null

  return (
    <div className="portal-idle-warning" role="status">
      {error ? <p className="notice-danger" role="alert">{error}</p> : <p>Your session will end soon for security. Stay signed in if you are still here.</p>}
      {warn ? <button type="button" onClick={() => void postActivity(true)}>Stay signed in</button> : null}
    </div>
  )
}
