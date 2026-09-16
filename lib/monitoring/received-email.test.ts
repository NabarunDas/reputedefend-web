import { describe, expect, it } from "vitest"
import {
  brandName,
  brandSiteUrl,
  brandTagline,
} from "@/lib/brand"
import {
  buildMonitoringReceivedCustomerMessage,
  buildMonitoringReceivedInternalMessage,
  monitoringReceivedCustomerHtml,
  monitoringReceivedCustomerLogoUrl,
  monitoringReceivedCustomerSubject,
  monitoringReceivedInternalSubject,
} from "@/lib/monitoring/received-email"
import type { MonitoringIntakeSnapshot } from "@/lib/monitoring/snapshot"

const snapshot = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  phone: "+44 7700 900123",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 2,
  termsAccepted: true,
  source: "start-monitoring",
} satisfies MonitoringIntakeSnapshot

const commercialOrCaseCopy = /PR-|RV-|GR-|case reference|case ID|submission key|24\/7|real-time|continuous monitoring|guaranteed/i

describe("monitoring customer email", () => {
  it("uses a professional subject without a public reference", () => {
    expect(monitoringReceivedCustomerSubject()).toBe(
      "[ProfileRelaunch] We've received your Relaunch Guard setup request",
    )
  })

  it("includes the required receipt copy and no case language", () => {
    const message = buildMonitoringReceivedCustomerMessage(
      snapshot,
      "enquiries@reputedefend.com",
      snapshot.email,
    )
    for (const body of [message.text, message.html]) {
      expect(body).toContain(brandName)
      expect(body).toContain("Alex Morgan")
      expect(body).toContain("Harbour Bakery")
      expect(body).toContain("2")
      expect(body).toContain("Relaunch Guard")
      expect(body).toContain("What happens next")
      expect(body).toContain("Monitoring is not active yet")
      expect(body).toContain("Security reminder")
      expect(body).toContain("simply reply to this email")
      expect(body).toContain(brandTagline)
      expect(body).toContain("profilerelaunch.com")
      expect(body).not.toMatch(commercialOrCaseCopy)
    }
    expect(message.subject).not.toMatch(/PR-|RV-|GR-/)
    expect(message.html).toContain(monitoringReceivedCustomerLogoUrl())
    expect(message.html).toContain(`${brandSiteUrl}`)
    expect(message.html).toContain('alt="ProfileRelaunch"')
    expect(message.html).toMatch(/max-width:\s*600px/)
    expect(message.html).toContain("setup-summary-panel")
  })

  it("escapes untrusted HTML values", () => {
    const html = monitoringReceivedCustomerHtml({
      ...snapshot,
      fullName: `<script>alert("name")</script>`,
      businessName: `<img src=x onerror=alert(1)>`,
      businessProfileUrl: `https://example.com/?q="><script>alert(1)</script>`,
    })
    expect(html).not.toContain("<script>alert")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })

  it("does not leak secrets or UUIDs", () => {
    const message = buildMonitoringReceivedCustomerMessage(
      snapshot,
      "enquiries@reputedefend.com",
      snapshot.email,
    )
    expect(message.html).not.toMatch(/submission[_-]?key/i)
    expect(message.html).not.toMatch(/supabase/i)
    expect(message.html).not.toMatch(/resend/i)
    expect(message.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})

describe("monitoring internal email", () => {
  it("identifies the Guard request and operational fields", () => {
    const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const message = buildMonitoringReceivedInternalMessage(
      snapshot,
      "enquiries@reputedefend.com",
      "owner@example.com",
      undefined,
      new Date("2026-09-16T12:00:00.000Z"),
      requestId,
    )
    expect(monitoringReceivedInternalSubject("Harbour Bakery")).toBe(
      "[ProfileRelaunch] New Relaunch Guard setup request — Harbour Bakery",
    )
    expect(message.kind).toBe("internal")
    expect(message.to).toBe("owner@example.com")
    expect(message.text).toContain("Request type: Relaunch Guard")
    expect(message.text).toContain("Status: REQUESTED")
    expect(message.text).toContain("Name: Alex Morgan")
    expect(message.text).toContain("Email: alex@example.com")
    expect(message.text).toContain("Business: Harbour Bakery")
    expect(message.text).toContain("Country: United Kingdom")
    expect(message.text).toContain("Business Profile URL: https://maps.google.com/?cid=123")
    expect(message.text).toContain("Number of locations: 2")
    expect(message.text).toContain("Monitoring request ID: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    expect(message.text).not.toMatch(/submission[_-]?key/i)
    expect(message.text).not.toMatch(/RESEND|SUPABASE|apiKey/i)
    expect(message.subject).not.toMatch(/PR-|RV-|case reference/i)
  })
})
