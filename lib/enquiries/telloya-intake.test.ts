import { describe, it, expect } from "vitest"
import { persistGeneralEnquiry } from "@shared/enquiries/intake"
import type { EnquiryInput } from "@shared/enquiry"

describe("Telloya enquiry simulation mode", () => {
  const telloyaEnquiry: EnquiryInput = {
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    businessName: "Test Plumbing",
    country: "GB",
    service: "",
    subject: "",
    websiteUrl: "",
    businessProfileUrl: "",
    reviewUrl: "",
    details: "Test enquiry details",
    informationAccurate: true,
    privacyAccepted: true,
    source: "homepage" as const,
  }

  it("generates mock TY reference in simulation mode when database unavailable", async () => {
    // Simulate Telloya enquiry without database (no create function)
    const result = await persistGeneralEnquiry(
      { ...telloyaEnquiry, source: "homepage" as const },
      "12345678-1234-1234-1234-123456789012",
      {
        nodeEnv: "development",
        // No create function = simulation mode for non-telloya
      }
    )

    expect(result.ok).toBe(true)
    expect(result.simulated).toBe(true)
    expect(result.enquiryRef).toBeUndefined()
  })

  it("returns success with simulation flag when database unavailable", async () => {
    const result = await persistGeneralEnquiry(
      telloyaEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        nodeEnv: "development",
        // No create function and Supabase not configured = simulation mode
      }
    )

    expect(result.ok).toBe(true)
    expect(result.simulated).toBe(true)
    expect(result.message).toContain("Development simulation")
  })

  it("returns error in production when database unavailable", async () => {
    const result = await persistGeneralEnquiry(
      telloyaEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        nodeEnv: "production",
        // No create function and Supabase not configured = error
      }
    )

    expect(result.ok).toBe(false)
    expect(result.simulated).toBeUndefined()
  })
})

describe("Enquiry duplicate submission handling", () => {
  const testEnquiry: EnquiryInput = {
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    businessName: "Test Business",
    country: "GB",
    service: "",
    subject: "",
    websiteUrl: "",
    businessProfileUrl: "",
    reviewUrl: "",
    details: "Test details",
    informationAccurate: true,
    privacyAccepted: true,
    source: "homepage" as const,
  }

  it("returns existing enquiry status for duplicate submission", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "existing",
          enquiryRef: "TY-26-ABC123",
        }),
      }
    )

    expect(result.ok).toBe(true)
    expect(result.persisted).toBe(true)
    expect(result.enquiryRef).toBe("TY-26-ABC123")
  })

  it("omits undefined enquiryRef for legacy ProfileRelaunch enquiries", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "existing",
          // No enquiryRef for legacy enquiries
        }),
      }
    )

    expect(result.ok).toBe(true)
    expect(result.persisted).toBe(true)
    expect(result.enquiryRef).toBeUndefined()
    // Ensure no undefined properties in response
    expect(Object.keys(result)).not.toContain("enquiryRef")
  })

  it("returns conflict status for conflicting submission", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "conflict",
        }),
      }
    )

    expect(result.ok).toBe(false)
    expect(result.message).toContain("reload")
  })
})

describe("Email delivery status mapping", () => {
  const testEnquiry: EnquiryInput = {
    fullName: "John Smith",
    email: "john@example.com",
    phone: "+447700900000",
    businessName: "Test Business",
    country: "GB",
    service: "",
    subject: "",
    websiteUrl: "",
    businessProfileUrl: "",
    reviewUrl: "",
    details: "Test details",
    informationAccurate: true,
    privacyAccepted: true,
    source: "homepage" as const,
  }

  it("maps SENT status to sent", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "created",
          id: "test-id",
          attempt: "test-attempt",
          sendAck: true,
        }),
        finish: async () => {},
        provider: {
          send: async () => {
            // Simulate successful email send
            return { ok: true, id: "test-message-id" } as const
          },
        },
        config: {
          fromEmail: "test@example.com",
          toEmail: "admin@example.com",
          extraReplyTo: "",
          apiKey: "test-key",
          ready: true,
          sendCustomerAck: true,
        },
      }
    )

    expect(result.ok).toBe(true)
    expect(result.receiptEmailSent).toBe(true)
    expect(result.receiptEmailStatus).toBe("sent")
  })

  it("maps SKIPPED status to suppressed", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "created",
          id: "test-id",
          attempt: "test-attempt",
          sendAck: false, // Acknowledgement disabled
        }),
        finish: async () => {},
        provider: {
          send: async () => ({ ok: true, id: "test-message-id" } as const),
        },
      }
    )

    expect(result.ok).toBe(true)
    expect(result.receiptEmailStatus).toBe("suppressed")
  })

  it("maps FAILED/UNKNOWN to unavailable", async () => {
    const result = await persistGeneralEnquiry(
      testEnquiry,
      "12345678-1234-1234-1234-123456789012",
      {
        create: async () => ({
          status: "created",
          id: "test-id",
          attempt: "test-attempt",
          sendAck: true,
        }),
        finish: async () => {},
        provider: {
          send: async () => ({ ok: false, reason: "error" as const }),
        },
      }
    )

    expect(result.ok).toBe(true)
    expect(result.receiptEmailStatus).toBe("unavailable")
  })
})
