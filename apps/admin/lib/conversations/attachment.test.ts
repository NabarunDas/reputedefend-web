import { describe, expect, it } from "vitest"
import {
  MAX_INBOUND_ATTACHMENT_BYTES,
  createResendInboundAttachmentProvider,
  declaredInboundAttachment,
  inboundAttachmentObjectKey,
  isOpaqueInboundAttachmentKey,
  InboundAttachmentError,
} from "./attachment"

const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const attachmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

describe("inbound attachment helpers", () => {
  it("builds an opaque inbound object key", () => {
    const key = inboundAttachmentObjectKey(conversationId, messageId, attachmentId)
    expect(key).toBe(`inbound/${conversationId}/${messageId}/${attachmentId}`)
    expect(isOpaqueInboundAttachmentKey(key)).toBe(true)
    expect(key).not.toMatch(/id-scan|alex@example|subject|customer/i)
    expect(isOpaqueInboundAttachmentKey("conversations/a/b")).toBe(false)
  })

  it("rejects oversized and unsupported declared metadata without clamping", () => {
    expect(declaredInboundAttachment("id-scan.pdf", "application/pdf", 20_971_520)).toBeNull()
    expect(declaredInboundAttachment("note.txt", "text/plain", 12)).toBeNull()
    expect(declaredInboundAttachment("photo.gif", "image/gif", 12)).toBeNull()
    expect(declaredInboundAttachment("payload.exe", "application/pdf", 12)).toBeNull()
    expect(declaredInboundAttachment("id-scan.pdf", "application/pdf", 1200)).toEqual({
      filename: "id-scan.pdf",
      contentType: "application/pdf",
      size: 1200,
    })
    expect(MAX_INBOUND_ATTACHMENT_BYTES).toBe(10_485_760)
  })

  it("retrieves provider attachment bytes through the Resend receiving interface", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
    const get = async (options: { emailId: string; id: string }) => {
      expect(options).toEqual({ emailId: "email_1", id: "att_1" })
      return {
        data: {
          id: "att_1",
          filename: "id-scan.pdf",
          content_type: "application/pdf",
          size: bytes.byteLength,
          download_url: "https://example.test/att_1",
        },
      }
    }
    const fetchImpl: typeof fetch = async input => {
      expect(String(input)).toBe("https://example.test/att_1")
      return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.byteLength) } })
    }
    const provider = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get } } },
    }, fetchImpl)
    await expect(provider.getReceivedAttachment("email_1", "att_1")).resolves.toEqual({
      id: "att_1",
      filename: "id-scan.pdf",
      contentType: "application/pdf",
      size: bytes.byteLength,
      bytes,
    })
  })

  it("fails closed on a malformed provider download and rejects oversized content-length", async () => {
    const malformed = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "http://insecure.test/att" } }) } } },
    })
    await expect(malformed.getReceivedAttachment("email_1", "att_1")).rejects.toBeInstanceOf(InboundAttachmentError)
    const oversized = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "https://example.test/att", size: 20_971_520 } }) } } },
    })
    await expect(oversized.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "oversized" })
  })
})
