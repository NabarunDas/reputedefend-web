import { describe, expect, it, vi } from "vitest"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"
import type { EnquiryEmailMessage } from "@/lib/enquiry-provider"

const message: EnquiryEmailMessage = {
  kind: "internal",
  from: "ReputeDefend <enquiries@reputedefend.com>",
  to: "owner@example.com",
  replyTo: "alex@example.com",
  subject: "[ReputeDefend] New Profile Recovery case — Harbour Bakery",
  text: "Name: Alex Morgan",
  html: "<p>Name: Alex Morgan</p>",
}

describe("createResendEnquiryProvider", () => {
  it("confirms success only when Resend returns an id and no error", async () => {
    const send = vi.fn(async () => ({ data: { id: "email_123" }, error: null }))
    const provider = createResendEnquiryProvider("re_test_key", { emails: { send } })
    await expect(provider.send(message)).resolves.toEqual({ ok: true, id: "email_123" })
    expect(send).toHaveBeenCalledWith({
      from: message.from,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    })
  })

  it("treats a Resend error payload as rejection", async () => {
    const send = vi.fn(async () => ({ data: null, error: { message: "invalid from" } }))
    const provider = createResendEnquiryProvider("re_test_key", { emails: { send } })
    await expect(provider.send(message)).resolves.toEqual({ ok: false, reason: "rejected" })
  })

  it("treats a thrown client error as failure without leaking the exception", async () => {
    const send = vi.fn(async () => {
      throw new Error("RESEND_API_KEY leaked?")
    })
    const provider = createResendEnquiryProvider("re_test_key", { emails: { send } })
    await expect(provider.send(message)).resolves.toEqual({ ok: false, reason: "error" })
  })
})
