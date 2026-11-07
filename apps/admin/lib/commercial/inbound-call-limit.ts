/**
 * Prepared stop path for a call that is already connected.
 * A simulated stop is not spending-cap enforcement. The provider fallback and
 * the live stop result are still unverified.
 */

export type InProgressStopOutcome = "not_required" | "stopped" | "failed" | "timeout"

export type InProgressStopResult = {
  stopOutcome: InProgressStopOutcome
  /** Live cap enforcement is not claimed. This stays false after a simulated stop. */
  capEnforced: false
  simulated: true
}

export type InProgressStopCaller = (providerCallRef: string) => Promise<"stopped" | "failed" | "timeout">

export async function reconcileInProgressCall(input: {
  projectedPastCap: boolean
  providerCallRef: string
  stopCall: InProgressStopCaller
}): Promise<InProgressStopResult> {
  if (!input.projectedPastCap) {
    return { stopOutcome: "not_required", capEnforced: false, simulated: true }
  }
  try {
    const outcome = await input.stopCall(input.providerCallRef)
    if (outcome === "stopped") return { stopOutcome: "stopped", capEnforced: false, simulated: true }
    if (outcome === "timeout") return { stopOutcome: "timeout", capEnforced: false, simulated: true }
    return { stopOutcome: "failed", capEnforced: false, simulated: true }
  } catch {
    return { stopOutcome: "failed", capEnforced: false, simulated: true }
  }
}
