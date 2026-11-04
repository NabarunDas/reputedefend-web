"use client"

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react"
import Link from "next/link"
import {
  acceptAnalytics,
  getConsentSnapshot,
  openTelloyaCookieSettings,
  readStoredConsent,
  readTelloyaGaMeasurementId,
  subscribeConsent,
  TELLOYA_COOKIE_SETTINGS_EVENT,
  withdrawAnalytics,
} from "@/lib/analytics"
import styles from "./analytics-consent.module.css"

const OPERATOR_PRIVACY_HREF = "https://profilerelaunch.com/privacy"

function useClientReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

export function TelloyaCookieSettingsButton({ measurementId }: { measurementId?: string }) {
  if (!readTelloyaGaMeasurementId(measurementId ?? process.env.NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID)) return null

  return (
    <button
      type="button"
      className="footer-legal-link"
      aria-haspopup="dialog"
      onClick={openTelloyaCookieSettings}
    >
      Cookie settings
    </button>
  )
}

export function TelloyaAnalyticsConsent({ measurementId }: { measurementId?: string }) {
  const id = readTelloyaGaMeasurementId(measurementId)
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
    window.addEventListener(TELLOYA_COOKIE_SETTINGS_EVENT, onOpen)
    return () => window.removeEventListener(TELLOYA_COOKIE_SETTINGS_EVENT, onOpen)
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
      if (!first || !last) return
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
                Analytics helps Telloya understand how this website is used. It stays off until you accept it.
                Read the <Link href="/cookies">cookie notice</Link> or the operator&apos;s{" "}
                <a href={OPERATOR_PRIVACY_HREF} rel="noopener noreferrer">privacy notice</a>.
              </p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.accept} onClick={accept}>
                Accept analytics
              </button>
              <button type="button" className={styles.reject} onClick={reject}>
                Reject analytics
              </button>
              <button type="button" className={styles.settings} onClick={openTelloyaCookieSettings}>
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
              Necessary storage keeps Telloya working and remembers this choice. Analytics is off until you switch it on.
              Advertising and remarketing stay off.
            </p>

            <div className={styles.category}>
              <div className={styles.categoryHead}>
                <p className={styles.categoryName}>Necessary</p>
                <p className={styles.always}>Always active</p>
              </div>
              <p>Basic site operation and remembering whether analytics was accepted or rejected.</p>
            </div>

            <div className={styles.category}>
              <div className={styles.categoryHead}>
                <p className={styles.categoryName}>Analytics</p>
                <p className={styles.optional}>Optional</p>
              </div>
              <p>Understand aggregate use of the Telloya website. Not used for advertising.</p>
              <fieldset className={styles.toggle}>
                <legend className={styles.visuallyHidden}>Analytics</legend>
                <label>
                  <input
                    type="radio"
                    name="telloya-analytics-setting"
                    checked={!analyticsOn}
                    onChange={() => setAnalyticsOn(false)}
                  />
                  Off
                </label>
                <label>
                  <input
                    type="radio"
                    name="telloya-analytics-setting"
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
