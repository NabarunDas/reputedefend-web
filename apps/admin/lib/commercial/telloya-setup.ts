export type TelloyaSetupStep = "preferences" | "ai" | "number" | "forwarding" | "test_call" | "customer_connection"

export type TelloyaCustomerSetupStatus = "not_started" | "preparing" | "testing" | "ready_for_activation"

const STEP_LABELS: Record<TelloyaSetupStep, string> = {
  preferences: "Confirm preferences",
  ai: "Confirm AI configuration",
  number: "Record the provider number",
  forwarding: "Record forwarding instructions",
  test_call: "Record the test-call outcome",
  customer_connection: "Record the customer connection",
}

export function telloyaSetupChecklist(input: {
  initialInvoicePaid: boolean
  completed: TelloyaSetupStep[]
}): {
  customerStatus: TelloyaCustomerSetupStatus
  customerLabel: string
  next: string
  goLive: "blocked"
  goLiveReason: string
  steps: { id: TelloyaSetupStep; label: string; state: "complete" | "current" | "upcoming" | "closed" }[]
} {
  const order: TelloyaSetupStep[] = ["preferences", "ai", "number", "forwarding", "test_call", "customer_connection"]
  if (!input.initialInvoicePaid) {
    return {
      customerStatus: "not_started",
      customerLabel: "Not started",
      next: "Wait for a verified first invoice before setup.",
      goLive: "blocked",
      goLiveReason: "voice_safety_gates_unverified",
      steps: order.map(id => ({ id, label: STEP_LABELS[id], state: "closed" })),
    }
  }
  const done = new Set(input.completed)
  const current = order.find(id => !done.has(id)) ?? null
  const customerStatus: TelloyaCustomerSetupStatus = done.has("test_call")
    ? done.has("customer_connection") ? "ready_for_activation" : "testing"
    : "preparing"
  const labels: Record<TelloyaCustomerSetupStatus, string> = {
    not_started: "Not started",
    preparing: "Preparing your receptionist",
    testing: "Testing",
    ready_for_activation: "Ready for activation",
  }
  return {
    customerStatus,
    customerLabel: labels[customerStatus],
    next: current ? STEP_LABELS[current] : "Activation stays with an authorised operator. This checklist does not turn the service on.",
    goLive: "blocked",
    goLiveReason: "voice_safety_gates_unverified",
    steps: order.map(id => ({
      id,
      label: STEP_LABELS[id],
      state: done.has(id) ? "complete" : id === current ? "current" : "upcoming",
    })),
  }
}
