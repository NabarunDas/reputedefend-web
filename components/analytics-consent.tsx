"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react"
import Link from "next/link"
import {
  acceptAnalytics,
  COOKIE_SETTINGS_EVENT,
  getConsentSnapshot,
  openCookieSettings,
  readGaMeasurementId,
  readStoredConsent,
  subscribeConsent,
  withdrawAnalytics,
} from "@/lib/analytics"
import styles from "./analytics-consent.module.css"

function useClientReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

export function CookieSettingsButton({ measurementId }: { measurementId?: string }) {
  if (!readGaMeasurementId(measurementId ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)) return null

  return (
    <button
      type="button"
      className="footer-link"
      aria-haspopup="dialog"
      onClick={openCookieSettings}
    >
      Cookie settings
    </button>
  )
}

export function AnalyticsConsent({ measurementId }: { measurementId?: string }) {
  const id = readGaMeasurementId(measurementId)
  const headingId = useId()
  const dialogHeadingId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const client = useClientReady()
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analyticsOn, setAnalyticsOn] = useState(false)

  useEffect(() => {
    function onOpen() {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setAnalyticsOn(readStoredConsent() === "accepted")
      setSettingsOpen(true)
    }
    window.addEventListener(COOKIE_SETTINGS_EVENT, onOpen)
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    const root = dialogRef.current
    const focusables = root?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusables?.[0]?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setSettingsOpen(false)
        openerRef.current?.focus()
        return
      }
      if (event.key !== "Tab" || !focusables?.length) return
      const items = [...focusables]
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [settingsOpen])

  function closeSettings() {
    setSettingsOpen(false)
    openerRef.current?.focus()
  }

  function reject() {
    if (!id) return
    withdrawAnalytics(id)
    setAnalyticsOn(false)
    setSettingsOpen(false)
  }

  function accept() {
    if (!id) return
    acceptAnalytics(id)
    setAnalyticsOn(true)
    setSettingsOpen(false)
  }

  function saveSettings() {
    if (analyticsOn) accept()
    else reject()
  }

  if (!id || !client) return null

  const showBanner = consent === null && !settingsOpen

  return (
    <>
      {showBanner ? (
        <div className={styles.banner} role="region" aria-labelledby={headingId} data-testid="analytics-consent-banner">
          <div className={styles.bannerInner}>
            <div>
              <h2 id={headingId} className={styles.heading}>Analytics is optional</h2>
              <p>
                Analytics helps us understand how the public website is used and improve the experience. It is optional.
                Read the <Link href="/cookies">Cookie &amp; analytics notice</Link> or <Link href="/privacy">privacy notice</Link>.
              </p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.accept} onClick={accept}>
                Accept analytics
              </button>
              <button type="button" className={styles.reject} onClick={reject}>
                Reject analytics
              </button>
              <button type="button" className={styles.settings} onClick={openCookieSettings}>
                Settings
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className={styles.overlay}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogHeadingId}
            data-testid="cookie-settings-dialog"
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Escape") closeSettings()
            }}
          >
            <h2 id={dialogHeadingId} className={styles.heading}>Cookie settings</h2>
            <p className={styles.dialogLead}>
              Necessary storage keeps the site working and remembers this choice. Analytics is off until you switch it on.
            </p>

            <div className={styles.category}>
              <div className={styles.categoryHead}>
                <p className={styles.categoryName}>Necessary</p>
                <p className={styles.always}>Always active</p>
              </div>
              <p>Basic site operation, security, and remembering privacy choices where required.</p>
            </div>

            <div className={styles.category}>
              <div className={styles.categoryHead}>
                <p className={styles.categoryName}>Analytics</p>
                <p className={styles.optional}>Optional</p>
              </div>
              <p>Understand aggregate website usage and improve the site. Not used for advertising by ProfileRelaunch.</p>
              <fieldset className={styles.toggle}>
                <legend className={styles.visuallyHidden}>Analytics</legend>
                <label>
                  <input
                    type="radio"
                    name="analytics-setting"
                    checked={!analyticsOn}
                    onChange={() => setAnalyticsOn(false)}
                  />
                  Off
                </label>
                <label>
                  <input
                    type="radio"
                    name="analytics-setting"
                    checked={analyticsOn}
                    onChange={() => setAnalyticsOn(true)}
                  />
                  On
                </label>
              </fieldset>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.accept} onClick={saveSettings}>
                Save settings
              </button>
              <button type="button" className={styles.settings} onClick={closeSettings}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
