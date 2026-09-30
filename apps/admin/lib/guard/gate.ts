import "server-only"

export function guardActivationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GUARD_ACTIVATION_ENABLED === "true"
}

export function guardSubscriptionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GUARD_SUBSCRIPTIONS_ENABLED === "true"
}

export function guardRefundsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GUARD_REFUNDS_ENABLED === "true"
}
