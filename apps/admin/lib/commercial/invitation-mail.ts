export type InvitationMail = {
  status: "none" | "queued" | "processing" | "unknown" | "accepted" | "delivered" | "attention" | "revoked" | "expired" | "used" | "unavailable"
  detail: string
  canSend: boolean
  canResend: boolean
  canProcess: boolean
  canRevoke: boolean
}
