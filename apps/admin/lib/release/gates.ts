/**
 * The six live capabilities that produce an effect outside ProfileRelaunch,
 * described in one place so a release check can ask the real gate functions
 * whether a configuration would turn any of them on.
 *
 * Nothing here re-implements a gate. Each capability calls the function the
 * runtime calls, so the answer cannot drift from the behaviour. `gates.test.ts`
 * drives these over synthetic configurations only; no production value is read
 * and no provider is contacted.
 */

import { communicationsSendEnabled } from "../communications/gate"
import { communicationsInboundEnabled } from "../conversations/gate"
import { type EnvMap } from "../jobs/config"
import { privacyDeletionEnabled } from "../settings/model"
import {
  guardAlertNotificationsEnabled,
  guardAlertsEnabled,
  guardChecksEnabled,
} from "../guard/gate"
import { paymentsEnabled } from "../../../../lib/payments/config"
import { googleConnectExecution } from "../../../../lib/google-business-profile/live-stack"

export type CapabilityId =
  | "google_api"
  | "stripe_payments"
  | "outgoing_mail"
  | "inbound_mail"
  | "guard_automation"
  | "privacy_deletion"

export type LiveCapability = {
  id: CapabilityId
  name: string
  /** True only when the configuration would allow a real external effect. */
  live: (env: EnvMap) => boolean
  /**
   * The flag an operator sets to ask for this capability, as distinct from
   * the credentials it needs. Supplying credentials alone must never be
   * enough. Guard automation has several, listed most significant first.
   */
  enableFlags: string[]
  /** Credential or configuration variables that must not enable anything on their own. */
  credentials: string[]
  /**
   * A condition the running code enforces that no environment variable can
   * satisfy, where one exists. Null when the gate is configuration-only.
   */
  codeLevelBlock: string | null
  /** Why the capability is still off, in operator language. */
  whyOff: string
}

/**
 * Guard automation is the scheduled half of Guard: obligation generation,
 * alert maintenance and alert notification. Manual Guard checks are not part
 * of it and are not gated by any of these flags.
 */
function guardAutomationLive(env: EnvMap): boolean {
  return guardChecksEnabled(env) || guardAlertsEnabled(env) || guardAlertNotificationsEnabled(env)
}

export const liveCapabilities: readonly LiveCapability[] = [
  {
    id: "google_api",
    name: "Google Business Profile API",
    live: env => googleConnectExecution(env).available,
    enableFlags: ["GOOGLE_BUSINESS_PROFILE_API_ENABLED", "GOOGLE_BUSINESS_PROFILE_PROVIDER"],
    credentials: [
      "GOOGLE_BUSINESS_PROFILE_CLIENT_ID",
      "GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET",
      "GOOGLE_BUSINESS_PROFILE_REDIRECT_URI",
      "GOOGLE_BUSINESS_PROFILE_TOKEN_KEY",
    ],
    codeLevelBlock:
      "googleLiveStack is null, so googleConnectExecution() reports connection_not_implemented however the environment is set. Activation needs a token exchange and a transport to be written and reviewed.",
    whyOff: "No live Google transport exists in this build and the API gate is unset.",
  },
  {
    id: "stripe_payments",
    name: "Stripe payments",
    live: env => paymentsEnabled(env),
    enableFlags: ["PAYMENTS_PROVIDER_MODE"],
    credentials: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    codeLevelBlock:
      "stripeSecret() accepts only a key beginning sk_test_ or rk_test_, so a live Stripe key is rejected by the code rather than by configuration. There is no mode value that selects live Stripe.",
    whyOff: "PAYMENTS_PROVIDER_MODE is unset, so the provider mode resolves to disabled.",
  },
  {
    id: "outgoing_mail",
    name: "Outgoing transactional mail",
    live: env => communicationsSendEnabled(env),
    enableFlags: ["COMMUNICATIONS_SEND_ENABLED"],
    credentials: ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "COMMUNICATIONS_LINK_SECRET", "COMMUNICATIONS_FROM_EMAIL"],
    codeLevelBlock:
      "The gate also requires VERCEL_ENV=production, JOB_WORKER_ENABLED=true, provider mode production and a worker cadence of 300 seconds or less, so the current daily 0 4 * * * schedule cannot carry live mail.",
    whyOff: "COMMUNICATIONS_SEND_ENABLED and JOB_WORKER_ENABLED are unset and the worker cadence is daily.",
  },
  {
    id: "inbound_mail",
    name: "Inbound mail ingestion",
    live: env => communicationsInboundEnabled(env),
    enableFlags: ["COMMUNICATIONS_INBOUND_ENABLED"],
    credentials: ["RESEND_API_KEY", "RESEND_INBOUND_WEBHOOK_SECRET", "INBOUND_MAIL_DOMAIN"],
    codeLevelBlock:
      "inboundMailDomain() refuses the apex profilerelaunch.com, so inbound MX cannot be pointed at the domain that carries the Google Workspace mailbox.",
    whyOff: "COMMUNICATIONS_INBOUND_ENABLED and JOB_WORKER_ENABLED are unset and no inbound domain is configured.",
  },
  {
    id: "guard_automation",
    name: "Guard automated checks, alerts and alert notifications",
    live: guardAutomationLive,
    enableFlags: ["GUARD_CHECKS_ENABLED", "GUARD_ALERTS_ENABLED", "GUARD_ALERT_NOTIFICATIONS_ENABLED"],
    credentials: [],
    codeLevelBlock:
      "guard_check_observations.capture_method accepts only MANUAL, so no automated observation can be persisted even if the scheduled jobs were enabled.",
    whyOff: "All three Guard automation flags are unset, so the worker generates no obligation and raises no alert.",
  },
  {
    id: "privacy_deletion",
    name: "Physical deletion of personal data",
    live: env => privacyDeletionEnabled(env),
    enableFlags: ["PRIVACY_DELETION_ENABLED"],
    credentials: [],
    codeLevelBlock:
      "A legal hold blocks deletion in the database independently of the flag, and financial and audit records are retained by category rather than deleted.",
    whyOff: "PRIVACY_DELETION_ENABLED is unset, so a deletion disposition records the decision and removes nothing.",
  },
]

export type CapabilityState = {
  id: CapabilityId
  name: string
  live: boolean
  whyOff: string
}

/**
 * Asking one capability's gate. Lifting the gate out of the capability before
 * calling it keeps the environment flowing into a plainly named function,
 * which is the only shape `source-scan.ts` can follow.
 */
function isLive(entry: LiveCapability, env: EnvMap): boolean {
  const gate = entry.live
  return gate(env)
}

/** What each live capability would do under the supplied configuration. */
export function liveCapabilityStates(env: EnvMap): CapabilityState[] {
  return liveCapabilities.map(entry => ({
    id: entry.id,
    name: entry.name,
    live: isLive(entry, env),
    whyOff: entry.whyOff,
  }))
}

/** Capability ids that the supplied configuration would switch on. */
export function liveCapabilityIds(env: EnvMap): CapabilityId[] {
  return liveCapabilities.filter(entry => isLive(entry, env)).map(entry => entry.id)
}

export function capability(id: CapabilityId): LiveCapability {
  const found = liveCapabilities.find(entry => entry.id === id)
  if (!found) throw new Error(`Unknown capability: ${id}`)
  return found
}

/**
 * Values an operator might reasonably expect to mean yes. The gates accept
 * exactly "true" and nothing else, which is what keeps a typo from enabling a
 * provider effect.
 */
export const nonEnablingTruthyValues = ["1", "yes", "on", "TRUE", "True", "true ", " true", "y", "enabled"]
