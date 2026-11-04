"use client"

import { TelloyaAnalyticsConsent } from "@/components/analytics-consent"
import { TelloyaGoogleAnalytics } from "@/components/google-analytics"
import { readTelloyaGaMeasurementId } from "@/lib/analytics"

export function TelloyaAnalyticsRoot({ measurementId }: { measurementId?: string }) {
  const id = readTelloyaGaMeasurementId(measurementId)
  return (
    <>
      <TelloyaAnalyticsConsent measurementId={id} />
      <TelloyaGoogleAnalytics measurementId={id} />
    </>
  )
}
