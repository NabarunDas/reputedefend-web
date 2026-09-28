// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { AuthorizationPanel } from "./authorization-forms"
import type { CaseAuthorization } from "@/lib/authorization/model"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("../../records/forms", () => ({
  CommandForm: ({ children, submitLabel }: { children?: React.ReactNode; submitLabel: string }) => <form>{children}<button type="submit">{submitLabel}</button></form>,
  Reason: ({ label = "Reason for this change" }: { label?: string }) => <label>{label}<textarea name="reason" /></label>,
}))

afterEach(() => cleanup())

const data = {
  caseId: "55555555-5555-4555-8555-555555555555",
  reference: "PR-1",
  customerId: "22222222-2222-4222-8222-222222222222",
  businessId: "33333333-3333-4333-8333-333333333333",
  locationId: "44444444-4444-4444-8444-444444444444",
  track: "MANAGED",
  stage: "AUTHORIZATION_REQUIRED",
  emailMasked: "a***@example.com",
  membershipStatus: "verified",
  readiness: {
    businessAuthorityVerified: true, customerEmailVerified: true, serviceAgreementAccepted: false,
    caseManagementPermissionActive: false, managerAccessVerified: false, managedTrack: true, authorizationReady: false,
  },
  readinessNote: "not payment",
  agreements: [],
  authorizations: [],
  actions: [],
  managerAccess: null,
} as CaseAuthorization

describe("authorization panel", () => {
  it("keeps Manager access independent and never asks for a Google password or OTP", () => {
    render(<AuthorizationPanel caseId={data.caseId} data={data} />)
    expect(screen.getByRole("heading", { name: "Agreements & permissions" })).toBeTruthy()
    expect(screen.getByText(/Use only owner-approved service wording/)).toBeTruthy()
    expect(screen.getByText(/Never request or record the customer's Google password/)).toBeTruthy()
    expect(document.querySelector("input[type=password], input[autocomplete=one-time-code], input[name=password], input[name=otp]")).toBeNull()
    expect(screen.queryByPlaceholderText(/password|one-time|otp/i)).toBeNull()
    expect(document.body.textContent).not.toMatch(/Customer accepted|Mark as paid|Submit to Google/i)
    expect(screen.getByText(/Managed authorisation readiness/)).toBeTruthy()
  })
  it("shows the exact issued snapshot for Admin review", () => {
    render(<AuthorizationPanel caseId={data.caseId} data={{
      ...data,
      agreements: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        kind: "SERVICE_AGREEMENT",
        versionNumber: 1,
        title: "Managed recovery service agreement",
        body: "Exact owner-approved body for this snapshot.",
        scope: "Restore the listed Google Business Profile for this case only.",
        contentHash: "ab".repeat(32),
        createdAt: "2026-09-18T12:00:00.000Z",
      }],
    }} />)
    expect(screen.getByText("Exact owner-approved body for this snapshot.")).toBeTruthy()
    expect(screen.getByText(new RegExp(`SHA-256 ${"ab".repeat(32)}`))).toBeTruthy()
  })
  it("marks Managed permission and Manager access as not applicable on Guided cases", () => {
    render(<AuthorizationPanel caseId={data.caseId} data={{
      ...data,
      track: "GUIDED",
      readiness: { ...data.readiness, managedTrack: false, authorizationReady: false },
    }} />)
    expect(screen.getByText(/not applicable on this Guided case/)).toBeTruthy()
    expect(screen.queryByText(/Record Manager access verified/)).toBeNull()
    expect(screen.queryByRole("option", { name: "Case-management permission" })).toBeNull()
    expect(screen.getByText(/Create service agreement action/)).toBeTruthy()
  })
})
