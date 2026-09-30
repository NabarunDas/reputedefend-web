import "server-only"

export type GuardBillingEnv = Record<string, string | undefined>

export function guardActivationEnabled(env: GuardBillingEnv = process.env): boolean {
  return env.GUARD_ACTIVATION_ENABLED === "true"
}

export function guardSubscriptionsEnabled(env: GuardBillingEnv = process.env): boolean {
  return env.GUARD_SUBSCRIPTIONS_ENABLED === "true"
}

export function guardRefundsEnabled(env: GuardBillingEnv = process.env): boolean {
  return env.GUARD_REFUNDS_ENABLED === "true"
}

export function guardChecksEnabled(env: GuardBillingEnv = process.env): boolean {
  return env.GUARD_CHECKS_ENABLED === "true"
}
