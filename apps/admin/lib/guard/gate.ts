import "server-only"

export function guardActivationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.GUARD_ACTIVATION_ENABLED === "true"
}
