import { describe, expect, it } from "vitest"
import {
  MAX_INBOUND_ATTACHMENT_BYTES,
  classifyResendAttachmentError,
  createResendInboundAttachmentProvider,
  declaredInboundAttachment,
  inboundAttachmentObjectKey,
  isOpaqueInboundAttachmentKey,
  readBoundedAttachmentBytes,
  InboundAttachmentError,
} from "./attachment"

const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const attachmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

function countingStream(chunks: Uint8Array[]) {
  let pulls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[pulls])
      pulls += 1
    },
  })
  return { stream, get pulls() { return pulls } }
}

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

  it("classifies Resend provider errors as retryable or terminal", () => {
    expect(classifyResendAttachmentError({ name: "rate_limit_exceeded", statusCode: 429, message: "Too many" })).toBe("retryable")
    expect(classifyResendAttachmentError({ name: "internal_server_error", statusCode: 500, message: "boom" })).toBe("retryable")
    expect(classifyResendAttachmentError({ name: "application_error", statusCode: 503, message: "unavailable" })).toBe("retryable")
    expect(classifyResendAttachmentError({ name: "validation_error", statusCode: 400, message: "timeout connecting" })).toBe("retryable")
    expect(classifyResendAttachmentError({ name: "not_found", statusCode: 404, message: "Missing" })).toBe("unavailable")
    expect(classifyResendAttachmentError({ name: "validation_error", statusCode: 400, message: "bad attachment" })).toBe("malformed")
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
        error: null,
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

  it("retries Resend 429, 5xx and network failures without treating them as malformed", async () => {
    const rateLimited = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: null, error: { name: "rate_limit_exceeded", statusCode: 429, message: "Too many requests" } }) } } },
    })
    await expect(rateLimited.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "retryable" })
    const serverError = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "upstream" } }) } } },
    })
    await expect(serverError.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "retryable" })
    const network = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => { throw new Error("ECONNRESET") } } } },
    })
    await expect(network.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "retryable" })
    const download429 = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "https://example.test/att" }, error: null }) } } },
    }, async () => new Response("", { status: 429 }))
    await expect(download429.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "retryable" })
    const download500 = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "https://example.test/att" }, error: null }) } } },
    }, async () => new Response("", { status: 503 }))
    await expect(download500.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "retryable" })
  })

  it("terminalises malformed metadata and a permanent missing attachment", async () => {
    const malformed = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "http://insecure.test/att" }, error: null }) } } },
    })
    await expect(malformed.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "malformed" })
    const missingUrl = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1" }, error: null }) } } },
    })
    await expect(missingUrl.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "malformed" })
    const missing = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: null, error: { name: "not_found", statusCode: 404, message: "Attachment not found" } }) } } },
    })
    await expect(missing.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "unavailable" })
    const oversized = createResendInboundAttachmentProvider("re_test", {
      emails: { receiving: { attachments: { get: async () => ({ data: { id: "att_1", download_url: "https://example.test/att", size: 20_971_520 }, error: null }) } } },
    })
    await expect(oversized.getReceivedAttachment("email_1", "att_1")).rejects.toMatchObject({ code: "oversized" })
  })

  it("rejects an oversized Content-Length before reading the body", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-length": String(MAX_INBOUND_ATTACHMENT_BYTES + 1) },
    })
    await expect(readBoundedAttachmentBytes(response)).rejects.toMatchObject({ code: "oversized" })
    expect(response.bodyUsed).toBe(false)
  })

  it("rejects an oversized stream when Content-Length is absent", async () => {
    const counted = countingStream([
      new Uint8Array(MAX_INBOUND_ATTACHMENT_BYTES),
      new Uint8Array([1]),
    ])
    await expect(readBoundedAttachmentBytes(new Response(counted.stream))).rejects.toMatchObject({ code: "oversized" })
    expect(counted.pulls).toBe(2)
  })

  it("rejects a dishonest small Content-Length once the stream exceeds the cap", async () => {
    const counted = countingStream([
      new Uint8Array(MAX_INBOUND_ATTACHMENT_BYTES),
      new Uint8Array([9]),
    ])
    const response = new Response(counted.stream, { headers: { "content-length": "100" } })
    await expect(readBoundedAttachmentBytes(response)).rejects.toMatchObject({ code: "oversized" })
    expect(counted.pulls).toBe(2)
  })

  it("accepts a stream that is exactly the configured maximum", async () => {
    const bytes = new Uint8Array(MAX_INBOUND_ATTACHMENT_BYTES)
    bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d])
    const counted = countingStream([bytes])
    const response = new Response(counted.stream, { headers: { "content-length": String(MAX_INBOUND_ATTACHMENT_BYTES) } })
    await expect(readBoundedAttachmentBytes(response)).resolves.toHaveLength(MAX_INBOUND_ATTACHMENT_BYTES)
    expect(counted.pulls).toBe(1)
  })

  it("rejects a zero-byte stream as malformed", async () => {
    await expect(readBoundedAttachmentBytes(new Response(new Uint8Array()))).rejects.toBeInstanceOf(InboundAttachmentError)
    await expect(readBoundedAttachmentBytes(new Response(new Uint8Array()))).rejects.toMatchObject({ code: "malformed" })
  })
})
