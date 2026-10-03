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

  it("announces an ordinary notice without an interrupting alert", () => {
    render(<Notice tone="warning">The history is incomplete.</Notice>)
    expect(screen.getByRole("status")).toHaveTextContent("The history is incomplete.")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("uses an alert only when the notice is urgent", () => {
    render(<Notice tone="danger" urgent>The case could not be loaded.</Notice>)
    expect(screen.getByRole("alert")).toHaveTextContent("The case could not be loaded.")
  })
})
