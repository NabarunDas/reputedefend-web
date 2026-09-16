import { describe, expect, it } from "vitest"
import {
  buildMonitoringIntakeSnapshot,
  parseMonitoringIntakeSnapshot,
  type MonitoringIntakeInput,
} from "@/lib/monitoring/snapshot"

const validInput = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  phone: "+44 7700 900123",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 2,
  termsAccepted: true,
} satisfies MonitoringIntakeInput

describe("buildMonitoringIntakeSnapshot", () => {
  it("stores future /start-monitoring fields without secrets or a public reference", () => {
    const snapshot = buildMonitoringIntakeSnapshot(validInput)
    expect(snapshot).toEqual({
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
    })
    expect(JSON.stringify(snapshot)).not.toMatch(/companyFax|honeypot|RESEND|SUPABASE|apiKey|secret|ip address/i)
    expect(snapshot).not.toHaveProperty("companyFax")
    expect(snapshot).not.toHaveProperty("ip")
    expect(snapshot).not.toHaveProperty("publicRef")
    expect(snapshot).not.toHaveProperty("public_ref")
    expect(snapshot).not.toHaveProperty("caseType")
    expect(snapshot).not.toHaveProperty("reviewUrl")
    expect(snapshot).not.toHaveProperty("issueDescription")
  })
})

describe("parseMonitoringIntakeSnapshot", () => {
  it("round-trips a valid snapshot", () => {
    const parsed = parseMonitoringIntakeSnapshot(buildMonitoringIntakeSnapshot(validInput))
    expect(parsed?.businessName).toBe("Harbour Bakery")
    expect(parsed?.numberOfLocations).toBe(2)
    expect(parsed?.source).toBe("start-monitoring")
  })

  it("rejects incomplete snapshots", () => {
    expect(parseMonitoringIntakeSnapshot(null)).toBeNull()
    expect(parseMonitoringIntakeSnapshot({ corrupted: true })).toBeNull()
    expect(parseMonitoringIntakeSnapshot({ ...buildMonitoringIntakeSnapshot(validInput), email: 42 })).toBeNull()
    expect(parseMonitoringIntakeSnapshot({
      ...buildMonitoringIntakeSnapshot(validInput),
      source: "get-help",
    })).toBeNull()
    expect(parseMonitoringIntakeSnapshot({
      ...buildMonitoringIntakeSnapshot(validInput),
      termsAccepted: false,
    })).toBeNull()
    expect(parseMonitoringIntakeSnapshot({
      ...buildMonitoringIntakeSnapshot(validInput),
      numberOfLocations: 0,
    })).toBeNull()
    expect(parseMonitoringIntakeSnapshot({
      ...buildMonitoringIntakeSnapshot(validInput),
      numberOfLocations: 1001,
    })).toBeNull()
  })
})
