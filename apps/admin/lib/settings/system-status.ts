import "server-only"
import {
  guardActivationEnabled,
  guardAlertNotificationsEnabled,
  guardAlertsEnabled,
  guardChecksEnabled,
  guardRefundsEnabled,
  guardSubscriptionsEnabled,
} from "../guard/gate"
import { communicationsSendEnabled } from "../communications/gate"
import { communicationsInboundEnabled } from "../conversations/gate"
import { resolvePaymentProviderMode } from "../../../../lib/payments/config"
import { configuredStatusLabel } from "../../../../lib/google-business-profile/resolve"
import { privacyDeletionEnabled } from "./model"

export type SystemStatusLabel =
  | "Enabled"
  | "Disabled"
  | "Configured"
  | "Not configured"
  | "Test configuration"
  | "Manual mode"
  | "Connected"
  | "Needs re-authorization"
  | "Quota limited"
  | "Provider degraded"

function onOff(value: boolean): "Enabled" | "Disabled" {
  return value ? "Enabled" : "Disabled"
}

export function systemConfigurationStatus(env: Record<string, string | undefined> = process.env) {
  const paymentMode = resolvePaymentProviderMode(env)
  return {
    guardActivation: onOff(guardActivationEnabled(env)),
    guardChecks: onOff(guardChecksEnabled(env)),
    guardAlerts: onOff(guardAlertsEnabled(env)),
    guardAlertNotifications: onOff(guardAlertNotificationsEnabled(env)),
    guardSubscriptions: onOff(guardSubscriptionsEnabled(env)),
    refunds: onOff(guardRefundsEnabled(env)),
    outgoingCommunications: onOff(communicationsSendEnabled(env)),
    inboundMail: communicationsInboundEnabled(env) ? "Configured" : "Not configured",
    paymentProvider: paymentMode === "stripe_test" ? "Test configuration" : "Disabled",
    google: configuredStatusLabel(env),
    privacyDeletion: onOff(privacyDeletionEnabled(env)),
  } satisfies Record<string, SystemStatusLabel>
}
