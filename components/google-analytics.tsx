"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore } from "react"
import {
  DENIED_AD_CONSENT,
  getConsentSnapshot,
  readGaMeasurementId,
  sendSanitizedPageView,
  subscribeConsent,
} from "@/lib/analytics"

let configuredMeasurementId: string | undefined

export function resetGoogleAnalyticsRuntime() {
  configuredMeasurementId = undefined
}

function queueGtag(measurementId: string) {
  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args)
    }
  }

  const command = configuredMeasurementId ? "update" : "default"
  if (configuredMeasurementId === measurementId) return

  window.gtag("consent", command, {
    analytics_storage: "granted",
    ...DENIED_AD_CONSENT,
  })

  configuredMeasurementId = measurementId
  window.gtag("js", new Date())
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
}

export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const id = readGaMeasurementId(measurementId)
  const pathname = usePathname()
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot)
  const lastSentPath = useRef<string | null>(null)
  const enabled = Boolean(id && consent === "accepted")

  // Queue consent + config before the gtag.js tag is committed so the loader
  // cannot send an unsanitized automatic page view.
  if (typeof window !== "undefined" && enabled && id) {
    queueGtag(id)
  }

  useEffect(() => {
    if (consent === "rejected") resetGoogleAnalyticsRuntime()
  }, [consent])

  useEffect(() => {
    if (!enabled || !id) {
      lastSentPath.current = null
      return
    }
    if (lastSentPath.current === pathname) return
    lastSentPath.current = pathname
    sendSanitizedPageView(window.location.origin, pathname)
  }, [enabled, id, pathname])

  if (!enabled || !id) return null

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
      strategy="afterInteractive"
      data-testid="ga-external-script"
    />
  )
}
