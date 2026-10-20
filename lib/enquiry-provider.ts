export type EnquiryEmailMessage = {
  from: string
  to: string
  replyTo: string | string[]
  subject: string
  text: string
  html: string
  kind: "internal" | "customer-ack"
  /** Stable provider key. The same communication id must reuse the same key. */
  idempotencyKey?: string
}

export type EnquiryProviderResult =
  | { ok: true; id: string }
  | { ok: false; reason: "rejected" | "error" }

export type EnquiryProvider = {
  send(message: EnquiryEmailMessage): Promise<EnquiryProviderResult>
}
