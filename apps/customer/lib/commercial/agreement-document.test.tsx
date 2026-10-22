// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AGREEMENT_PDF_UNAVAILABLE } from "../../../../lib/commercial/agreement-pdf"

vi.mock("../../../../lib/commercial/agreement-pdf", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/commercial/agreement-pdf")>("../../../../lib/commercial/agreement-pdf")
  return {
    ...actual,
    buildAgreementPdf: () => {
      throw new actual.AgreementPdfError(0x4f60)
    },
  }
})

import { PaidServiceAgreementDocument } from "./agreement-document"

afterEach(cleanup)

describe("paid-service agreement download", () => {
  it("shows a customer message when the PDF cannot represent a character", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const createObjectURL = vi.spyOn(URL, "createObjectURL")
    render(
      <PaidServiceAgreementDocument
        version="PS-2026-10-14.2"
        hash="0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"
        body={"ProfileRelaunch Ltd — Paid-service agreement\n\nThe fee is £99."}
        heading="h2"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Download the agreement as a PDF" }))
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toBe(AGREEMENT_PDF_UNAVAILABLE)
    expect(alert.textContent).not.toMatch(/U\+/)
    expect(alert.textContent).not.toContain("4F60")
    expect(error).toHaveBeenCalledWith("Agreement PDF was not created.", 0x4f60)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(screen.getByRole("article", { name: "Paid-service agreement" }).textContent).toContain("The fee is £99.")
    error.mockRestore()
    createObjectURL.mockRestore()
  })
})
