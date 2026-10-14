// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import PaymentReturnPage from "./page"

describe("payment return page", () => {
  it("does not mark a payment or invoice paid", () => {
    render(<PaymentReturnPage />)
    expect(screen.getByRole("heading", { name: "We’re confirming your payment" })).toBeInTheDocument()
    expect(document.body.textContent).toMatch(/does not mark a payment as paid/)
    expect(document.body.textContent).toMatch(/does not start Guard billing/)
    expect(screen.queryByRole("button", { name: /mark paid|confirm payment/i })).toBeNull()
  })

  it("stays informational and does not offer an off-site link", () => {
    expect(PaymentReturnPage.length).toBe(0)
    render(<PaymentReturnPage />)
    expect(document.querySelector("a")).toBeNull()
    expect(document.body.textContent).toMatch(/signed Stripe webhook/)
    expect(screen.queryByText(/payment successful/i)).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/checkout\.stripe|invoice\.stripe|javascript:/)
  })
})
