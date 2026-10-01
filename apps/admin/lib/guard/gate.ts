import "server-only"
import {
  guardActivationEnabled as sharedActivation,
  guardAlertNotificationsEnabled as sharedAlertNotifications,
  guardAlertsEnabled as sharedAlerts,
  guardChecksEnabled as sharedChecks,
  guardRefundsEnabled as sharedRefunds,
  guardSubscriptionsEnabled as sharedSubscriptions,
} from "../../../../lib/guard-billing/config"

export function guardActivationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedActivation(env)
}

export function guardSubscriptionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedSubscriptions(env)
}

export function guardRefundsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedRefunds(env)
}

export function guardChecksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedChecks(env)
}

export function guardAlertsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedAlerts(env)
}

export function guardAlertNotificationsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return sharedAlertNotifications(env)
}
