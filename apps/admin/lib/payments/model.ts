export const paymentOperations = [
  "issue_guided_payment_action",
  "issue_managed_setup_action",
  "issue_recovery_action",
  "approve_success_fee",
  "revoke_action",
] as const
export type PaymentOperation = (typeof paymentOperations)[number]

export type MoneyOrder = {
  orderId: string
  orderRef: string
  customerId: string
  caseId: string | null
  serviceCode: string
  amountMinor: number
  currency: string
  paymentModel: string
  orderState: string
  version: number
  obligationId: string | null
  obligationKind: string | null
  obligationState: string | null
  setupReady: boolean
  consentId: string | null
  approvalId: string | null
  receiptId: string | null
  acceptedEvidence?: Array<{ id: string; filename: string; versionNumber: number }>
}

export type MoneyList = { orders: MoneyOrder[] }

export function obligationLabel(state: string | null | undefined): string {
  if (state === "DUE") return "Due"
  if (state === "COLLECTING") return "Collecting"
  if (state === "AUTHENTICATION_REQUIRED") return "Authentication required"
  if (state === "FAILED") return "Failed"
  if (state === "PAID") return "Paid"
  if (state === "VOID") return "Void"
  return "None"
}

export const LOST_PAYMENT_LINK_NOTE = "This secret is shown once. If the link is lost, revoke or wait for expiry and reissue."
