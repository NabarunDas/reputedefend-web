// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CaseClient } from "./case-client"
import type { CustomerCasePack } from "@/lib/case/model"

const fetchMock = vi.fn()
const open = vi.fn()
function tab() {
  return { opener: {} as Window | null, close: vi.fn(), location: { href: "about:blank", replace: vi.fn() } }
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("open", open)
  fetchMock.mockReset()
  open.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const empty: CustomerCasePack = {
  kind: "CASE_ACCESS",
  caseReference: "PR-26-ABCDEF",
  businessName: "Bakery",
  locationName: "High Street",
  maskedEmail: "a***@example.com",
  pack: null,
}

const published: CustomerCasePack = {
  ...empty,
  pack: {
    packNumber: 2,
    publishedAt: "2026-09-28T12:00:00.000Z",
    items: [{
      versionId: "77777777-7777-4777-8777-777777777777",
      position: 1,
      documentTitle: "Supporting invoice",
      originalFilename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    }],
  },
}

describe("customer case documents", () => {
  it("shows the empty published-pack state without OTP or upload controls", () => {
    render(<CaseClient data={empty} />)
    expect(screen.getByRole("heading", { name: "Case documents" })).toBeTruthy()
    expect(screen.getByText(/PR-26-ABCDEF/)).toBeTruthy()
    expect(screen.getByText(/No case documents are currently published/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/dashboard|billing|storage|arn:aws/i)
  })

  it("lists published documents and opens View without sending a case id", async () => {
    const opened = tab()
    open.mockReturnValue(opened)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "Open the file in the new tab.", url: "https://s3.example/object?X-Amz-Expires=60" }) })
    render(<CaseClient data={published} />)
    expect(screen.getByText("Supporting invoice")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    await waitFor(() => expect(opened.location.replace).toHaveBeenCalledWith("https://s3.example/object?X-Amz-Expires=60"))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "view", versionId: "77777777-7777-4777-8777-777777777777",
    })
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).not.toMatch(/caseId|bucket|email/)
  })
})
