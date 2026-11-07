"use client"

import { TelloyaAnalyticsConsent } from "@/components/analytics-consent"
import { TelloyaGoogleAnalytics } from "@/components/google-analytics"
import {
  publishTelloyaAnalyticsEnvironment,
  readTelloyaGaMeasurementId,
  telloyaAnalyticsCollectionAllowed,
} from "@/lib/analytics"

export function TelloyaAnalyticsRoot({
  measurementId,
  deploymentEnvironment,
}: {
  measurementId?: string
  deploymentEnvironment?: string
}) {
  if (typeof window !== "undefined") publishTelloyaAnalyticsEnvironment(deploymentEnvironment)
  const id = readTelloyaGaMeasurementId(measurementId)
  if (!telloyaAnalyticsCollectionAllowed(deploymentEnvironment) || !id) return null
  return (
    <>
      <TelloyaAnalyticsConsent measurementId={id} />
      <TelloyaGoogleAnalytics measurementId={id} deploymentEnvironment={deploymentEnvironment} />
    </>
  )
}
