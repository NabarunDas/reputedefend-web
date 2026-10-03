// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import { Badge, Notice } from "./ui"

afterEach(() => cleanup())

describe("shared status presentation", () => {
  it("keeps the status word available without relying on the badge colour", () => {
    render(<Badge tone="warning">Needs attention</Badge>)
    expect(screen.getByText("Needs attention")).toBeInTheDocument()
    expect(screen.getByText("Needs attention").closest(".badge")).toHaveClass("badge-warning")
  })

  it("leaves an ordinary notice out of the live-region roles", () => {
    const { container } = render(<Notice tone="warning">The history is incomplete.</Notice>)
    const notice = container.querySelector(".notice")
    expect(notice).toHaveTextContent("The history is incomplete.")
    expect(notice).not.toHaveAttribute("role")
    expect(notice).not.toHaveAttribute("aria-live")
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("uses a status role only when a dynamic update asks for one", () => {
    render(<Notice live="status">The draft was saved.</Notice>)
    const notice = screen.getByRole("status")
    expect(notice).toHaveTextContent("The draft was saved.")
    expect(notice).not.toHaveAttribute("aria-live")
  })

  it("uses an alert only when the notice is an interruption", () => {
    render(<Notice tone="danger" live="alert">The case could not be loaded.</Notice>)
    const notice = screen.getByRole("alert")
    expect(notice).toHaveTextContent("The case could not be loaded.")
    expect(notice).not.toHaveAttribute("aria-live")
  })
})
