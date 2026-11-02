export type InvitationMail = {
  status: "none" | "queued" | "accepted" | "delivered" | "attention" | "revoked" | "expired" | "used" | "unavailable"
  detail: string
  canSend: boolean
  canResend: boolean
  canRevoke: boolean
}
