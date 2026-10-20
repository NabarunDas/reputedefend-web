// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CloseForm } from "../../forms"
import { caseDetail } from "./fixtures"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const settlement = "Closure needs the accepted service for this case and the recorded settlement that service requires. A checkout return, a saved card or an unpaid fee is not enough, and an unsuccessful case is not charged in order to close."

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the original case cockpit close form", () => {
  it("posts the same close command and shows the settlement refusal", async () => {
    const detail = caseDetail({ stage: "OUTCOME_REVIEW", track: "GUIDED", version: 4 })
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: settlement }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<CloseForm c={detail} />)
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy()
    expect(screen.getByText(/An unpaid fee, a checkout return or a saved card does not close the case/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "RESTORED" } })
    fireEvent.change(screen.getByLabelText("Customer summary"), { target: { value: "The listing was restored and the customer can see it." } })
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "Checked the restored listing before closing." } })
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!)
    expect(await screen.findByText(/is not enough/)).toBeTruthy()
    expect(screen.queryByText("Closed.")).toBeNull()
    expect(screen.queryByText(/case history has been updated/)).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/command")
    expect(payload.operation).toBe("close")
    expect(payload.version).toBe(4)
    expect(payload.data).toMatchObject({ outcome: "RESTORED", summary: "The listing was restored and the customer can see it." })
  })
})
