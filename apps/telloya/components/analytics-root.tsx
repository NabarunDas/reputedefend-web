"use client"

import { TelloyaAnalyticsConsent } from "@/components/analytics-consent"
import { TelloyaGoogleAnalytics } from "@/components/google-analytics"
import { readTelloyaGaMeasurementId, telloyaAnalyticsCollectionAllowed } from "@/lib/analytics"

export function TelloyaAnalyticsRoot({
  measurementId,
  deploymentEnvironment,
}: {
  measurementId?: string
  deploymentEnvironment?: string
}) {
  const id = readTelloyaGaMeasurementId(measurementId)
  if (!telloyaAnalyticsCollectionAllowed(deploymentEnvironment)) return null
  return (
    <>
      <TelloyaAnalyticsConsent measurementId={id} />
      <TelloyaGoogleAnalytics measurementId={id} />
    </>
  )
}
