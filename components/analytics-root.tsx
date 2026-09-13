"use client"

import { AnalyticsConsent } from "@/components/analytics-consent"
import { GoogleAnalytics } from "@/components/google-analytics"
import { readGaMeasurementId } from "@/lib/analytics"

export function AnalyticsRoot() {
  const measurementId = readGaMeasurementId()
  return (
    <>
      <AnalyticsConsent measurementId={measurementId} />
      <GoogleAnalytics measurementId={measurementId} />
    </>
  )
}
