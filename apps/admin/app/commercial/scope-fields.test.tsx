// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CommercialPriceChoice } from "@/lib/commercial-workspace/model"
import {
  scopeServiceCodes,
  standardScopeExclusions,
  type ScopeServiceCode,
} from "../../../../lib/commercial/scope-templates"
import { CaseQuoteForm } from "../cases/[id]/commercial/forms"
import { CreateQuoteForm } from "./forms"
import { ScopeExclusionsFields } from "./scope-fields"

const PRICE_ID = "77777777-7777-4777-8777-777777777777"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"

const markers: Record<ScopeServiceCode, string> = {
  GUIDED_RELAUNCH: "does not submit the prepared profile work",
  MANAGED_RELAUNCH: "not evidence that restoration has occurred",
  GUIDED_REVIEW: "does not submit the prepared review work",
  MANAGED_REVIEW: "not evidence that removal has occurred",
  RELAUNCH_GUARD: "does not start monitoring and does not take payment",
}

function choice(serviceCode: ScopeServiceCode): CommercialPriceChoice {
  return {
    id: PRICE_ID,
    serviceCode,
    serviceName: serviceCode,
    amountLabel: "£99.00",
    paymentLabel: "Upfront",
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("scope and exclusions fields", () => {
  it("fills each service from its standard template", () => {
    for (const serviceCode of scopeServiceCodes) {
      const wording = standardScopeExclusions(serviceCode)
      const { unmount } = render(<ScopeExclusionsFields serviceCode={serviceCode} />)
      expect(screen.getByLabelText("Scope")).toHaveValue(wording?.scope)
      expect(screen.getByLabelText("Exclusions")).toHaveValue(wording?.exclusions)
      expect((screen.getByLabelText("Exclusions") as HTMLTextAreaElement).value).toContain(markers[serviceCode])
      unmount()
    }
  })

  it("keeps an edit when the service changes and restores only the selected template", () => {
    const guided = standardScopeExclusions("GUIDED_RELAUNCH")
    const managed = standardScopeExclusions("MANAGED_RELAUNCH")
    const { rerender } = render(<ScopeExclusionsFields serviceCode="GUIDED_RELAUNCH" />)
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "Case-specific scope for this location only." } })
    fireEvent.change(screen.getByLabelText("Exclusions"), { target: { value: "Case-specific exclusions for this location." } })
    rerender(<ScopeExclusionsFields serviceCode="MANAGED_RELAUNCH" />)
    expect(screen.getByLabelText("Scope")).toHaveValue("Case-specific scope for this location only.")
    expect(screen.getByLabelText("Exclusions")).toHaveValue("Case-specific exclusions for this location.")
    expect(screen.getByLabelText("Scope")).not.toHaveValue(managed?.scope)

    fireEvent.click(screen.getByRole("button", { name: "Restore standard wording" }))
    expect(screen.getByLabelText("Scope")).toHaveValue(managed?.scope)
    expect(screen.getByLabelText("Exclusions")).toHaveValue(managed?.exclusions)
    expect(screen.getByLabelText("Scope")).not.toHaveValue(guided?.scope)
  })

  it("replaces untouched wording when the selected service changes", () => {
    render(<CreateQuoteForm />)
    expect(screen.getByLabelText("Scope")).toHaveValue(standardScopeExclusions("GUIDED_RELAUNCH")?.scope)
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "RELAUNCH_GUARD" } })
    expect(screen.getByLabelText("Scope")).toHaveValue(standardScopeExclusions("RELAUNCH_GUARD")?.scope)
    expect(screen.getByLabelText("Exclusions")).toHaveValue(standardScopeExclusions("RELAUNCH_GUARD")?.exclusions)
  })

  it("submits the edited wording and does not restore it on save", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Draft saved." }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<CaseQuoteForm
      caseId={CASE_ID}
      customerId={CUSTOMER_ID}
      businessId={BUSINESS_ID}
      locationId={null}
      customerName="Alex"
      businessName="Bakery"
      choice={choice("GUIDED_REVIEW")}
    />)
    const editedScope = "Prepare the review pack for this one review only."
    const editedExclusions = "Other reviews and Google's decision are outside this quote."
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: editedScope } })
    fireEvent.change(screen.getByLabelText("Exclusions"), { target: { value: editedExclusions } })
    fireEvent.change(screen.getByLabelText("Valid until"), { target: { value: "2026-12-01T12:00" } })
    fireEvent.submit(screen.getByRole("button", { name: "Create draft quote" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.")
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("create_draft")
    expect(payload.serviceCode).toBe("GUIDED_REVIEW")
    expect(payload.scope).toBe(editedScope)
    expect(payload.exclusions).toBe(editedExclusions)
    expect(payload.scope).not.toBe(standardScopeExclusions("GUIDED_REVIEW")?.scope)
    expect(screen.getByLabelText("Scope")).toHaveValue(editedScope)
  })
})
