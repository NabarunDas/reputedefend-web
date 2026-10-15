import { expectedLivemode, paymentsEnabled, resolvePaymentProviderMode, type PaymentEnv } from "./config"
import { PaymentsDisabledError } from "./provider"

export type DatabasePaymentLane = {
  configured: boolean
  mode: "stripe_test" | "stripe_live"
  expectedLivemode: boolean
}

export const PAYMENT_LANE_STATUS_RPC = "payment_provider_lane_status_v1"

type LaneRpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>

/**
 * Production stripe_live requires an explicit stripe_live database row.
 * No row is the DEV test lane. An explicit stripe_live row blocks Preview.
 */
export function databaseLaneAgrees(env: PaymentEnv, lane: DatabasePaymentLane | null | undefined): boolean {
  const mode = resolvePaymentProviderMode(env)
  if (mode !== "stripe_test" && mode !== "stripe_live") return false
  if (!lane || (lane.mode !== "stripe_test" && lane.mode !== "stripe_live")) return false
  if (lane.expectedLivemode !== (lane.mode === "stripe_live")) return false
  if (mode === "stripe_live") {
    return lane.configured === true && lane.mode === "stripe_live" && lane.expectedLivemode === true
  }
  if (lane.configured && lane.mode === "stripe_live") return false
  if (lane.expectedLivemode) return false
  return lane.mode === "stripe_test"
}

export function parseDatabasePaymentLane(value: unknown): DatabasePaymentLane | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const mode = row.mode
  if (mode !== "stripe_test" && mode !== "stripe_live") return null
  if (typeof row.configured !== "boolean" || typeof row.expectedLivemode !== "boolean") return null
  return { configured: row.configured, mode, expectedLivemode: row.expectedLivemode }
}

/**
 * Returns the database lane when this process may call Stripe.
 * Returns null when payments are not enabled, so local tests keep their fake provider.
 * Throws before any Stripe call when a deployed lane does not match the database.
 */
export async function guardExternalPayment(rpc: LaneRpc, env: PaymentEnv = process.env): Promise<DatabasePaymentLane | null> {
  if (!paymentsEnabled(env)) return null
  const lane = parseDatabasePaymentLane(await rpc(PAYMENT_LANE_STATUS_RPC, {}))
  if (!databaseLaneAgrees(env, lane)) {
    throw new PaymentsDisabledError("Payment database lane does not match this environment.")
  }
  return lane
}

/** Extra command field. Omitted unless payments are enabled, so existing payloads stay exact. */
export function declaredLivemodeField(env: PaymentEnv = process.env): { declaredLivemode?: "true" | "false" } {
  if (!paymentsEnabled(env)) return {}
  return { declaredLivemode: expectedLivemode(env) ? "true" : "false" }
}

export function declaredLivemodeArgument(env: PaymentEnv = process.env): { p_livemode?: boolean } {
  if (!paymentsEnabled(env)) return {}
  return { p_livemode: expectedLivemode(env) }
}
