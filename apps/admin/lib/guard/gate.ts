/**
 * The Guard flags, re-exported into Admin as server-only.
 *
 * These were wrappers that forwarded their environment to the shared gate.
 * Re-exporting instead keeps the identical function — same signature, same
 * `process.env` default, same values — while removing six whole-environment
 * hand-offs that said nothing a reader could check.
 */

import "server-only"

export {
  guardActivationEnabled,
  guardAlertNotificationsEnabled,
  guardAlertsEnabled,
  guardChecksEnabled,
  guardRefundsEnabled,
  guardSubscriptionsEnabled,
} from "../../../../lib/guard-billing/config"
