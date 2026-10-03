import { describe, expect, it } from "vitest"
import {
  caseDestination,
  caseDestinationKinds,
  destination,
  isInternalPath,
  recordDestination,
} from "./destinations"

const caseId = "11111111-2222-3333-4444-555555555555"

describe("case flow destinations", () => {
  it("produces an internal path for every fixed destination", () => {
    const fixed = caseDestinationKinds.filter(
      kind => !kind.startsWith("CASE") && !kind.endsWith("_RECORD"),
    )
    for (const kind of fixed) {
      const result = destination(kind)
      expect(result, kind).not.toBeNull()
      expect(isInternalPath(result!.href), result!.href).toBe(true)
      expect(result!.label).toBeTruthy()
    }
  })

  it("refuses to build a case destination without an identifier it trusts", () => {
    expect(destination("CASE")).toBeNull()
    expect(destination("CASE_EVIDENCE")).toBeNull()
    expect(caseDestination("CASE", "not-a-uuid")).toBeNull()
    expect(caseDestination("CASE", "")).toBeNull()
    expect(recordDestination("CLIENT_RECORD", null)).toBeNull()
    expect(recordDestination("BUSINESS_RECORD", "../../etc")).toBeNull()
  })

  it("builds case destinations from a checked identifier only", () => {
    expect(caseDestination("CASE", caseId)?.href).toBe(`/cases/${caseId}`)
    expect(caseDestination("CASE_EVIDENCE", caseId)?.href).toBe(`/cases/${caseId}/evidence`)
    expect(caseDestination("CASE_COMMUNICATIONS", caseId)?.href).toBe(`/cases/${caseId}/communications`)
    expect(caseDestination("CASE_COMMUNICATIONS", caseId)?.label).toBe("Case communications")
    expect(caseDestination("CASE_COMMUNICATIONS", "not-a-uuid")).toBeNull()
    expect(caseDestination("CASE_COMMUNICATIONS", "")).toBeNull()
    expect(caseDestination("CASE_COMMERCIAL", caseId)?.href).toBe(`/cases/${caseId}/commercial`)
    expect(caseDestination("CASE_COMMERCIAL", caseId)?.label).toBe("Commercial and money")
    expect(caseDestination("CASE_COMMERCIAL", "not-a-uuid")).toBeNull()
    expect(recordDestination("CLIENT_RECORD", caseId)?.href).toBe(`/records/client/${caseId}`)
    expect(recordDestination("BUSINESS_RECORD", caseId)?.href).toBe(`/records/business/${caseId}`)
  })

  it("rejects anything that could leave the application", () => {
    for (const href of [
      "https://evil.example.com",
      "//evil.example.com",
      "http://localhost/cases",
      "javascript:alert(1)",
      "/\\evil.example.com",
      "cases/123",
      "",
    ]) {
      expect(isInternalPath(href), href).toBe(false)
    }
  })

  it("accepts only the shapes it builds itself", () => {
    expect(isInternalPath("/cases")).toBe(true)
    expect(isInternalPath(`/cases/${caseId}/evidence`)).toBe(true)
    expect(isInternalPath(`/cases/${caseId}/commercial`)).toBe(true)
    expect(isInternalPath(`/cases/${caseId}/communications`)).toBe(true)
  })
})
