"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore } from "react"
import {
  DENIED_AD_CONSENT,
  TELLOYA_GA_RUNTIME_CONFIG,
  getConsentSnapshot,
  readTelloyaGaMeasurementId,
  sendSanitizedPageView,
  subscribeConsent,
} from "@/lib/analytics"

let configuredMeasurementId: string | undefined

export function resetTelloyaAnalyticsRuntime() {
  configuredMeasurementId = undefined
}

function queueGtag(measurementId: string) {
  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // gtag.js only processes queue entries that are Arguments objects. A rest
      // parameter pushes a plain Array, which is read as a GTM-style event and
      // never reaches /g/collect.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments)
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
  window.gtag("config", measurementId, { ...TELLOYA_GA_RUNTIME_CONFIG })
}

export function TelloyaGoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const id = readTelloyaGaMeasurementId(measurementId)
  const pathname = usePathname()
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getConsentSnapshot)
  const lastSentPath = useRef<string | null>(null)
  const enabled = Boolean(id && consent === "accepted")

  // Queue consent and config before the gtag.js tag is committed so the loader
  // cannot send an automatic page view.
  if (typeof window !== "undefined" && enabled && id) {
    queueGtag(id)
  }

  useEffect(() => {
    if (consent === "rejected") resetTelloyaAnalyticsRuntime()
  }, [consent])

  useEffect(() => {
    if (!enabled || !id) {
      lastSentPath.current = null
      return
    }
    const path = pathname || "/"
    if (lastSentPath.current === path) return
    lastSentPath.current = path
    sendSanitizedPageView(window.location.origin, path)
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
