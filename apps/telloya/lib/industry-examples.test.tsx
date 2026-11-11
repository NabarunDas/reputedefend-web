/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import Industries from "@/app/industries/page"
import { industriesContent, personalisedDemoOffer } from "@/lib/content"

afterEach(() => cleanup())

const expected = [
  ["Plumbing", "Leaking kitchen tap", "kitchen tap"],
  ["Heating Engineers", "Heating repair enquiry", "banging when the heating"],
  ["Electricians", "Additional sockets", "extra sockets"],
  ["Property Maintenance", "Routine tenant repair", "window latch"],
] as const

describe("industry illustrative examples", () => {
  it("gives each trade a caller line, configurable questions and a business summary", () => {
    expect(industriesContent.industries.map((industry) => industry.name)).toEqual([
      "Plumbing",
      "Heating Engineers",
      "Electricians",
      "Property Maintenance",
    ])
    for (const [name, title, detail] of expected) {
      const example = industriesContent.industries.find((industry) => industry.name === name)?.example
      expect(example?.title).toBe(title)
      expect(`${example?.caller} ${example?.questions} ${example?.summary}`.toLowerCase()).toContain(detail)
      expect(example?.caller.length).toBeGreaterThan(20)
      expect(example?.questions.length).toBeGreaterThan(20)
      expect(example?.summary.length).toBeGreaterThan(20)
    }
  })

  it("labels the conversations as illustrations and keeps unsupported claims out", () => {
    const spoken = industriesContent.industries
      .map((industry) => `${industry.example.caller} ${industry.example.questions} ${industry.example.summary}`)
      .join(" ")
    expect(industriesContent.exampleNotice).toMatch(/not a real customer conversation or a testimonial/i)
    expect(industriesContent.exampleNotice).toMatch(/configured during setup/i)
    expect(industriesContent.exampleNotice).toMatch(/does not book a visit, send an engineer, diagnose a fault/i)
    expect(spoken).not.toMatch(/testimonial|customers say|% of customers|guaranteed callback|appointment is booked|engineer is on the way/i)
    expect(spoken).not.toMatch(/\bdiagnoses\b|\bdispatches\b|\bbooks an appointment\b/i)
    expect(JSON.stringify(industriesContent.industries)).not.toMatch(/\bfree\b/i)
  })

  it("keeps the personalised-demo request and the general enquiry after the examples", () => {
    render(<Industries />)
    expect(screen.getByRole("note")).toHaveTextContent(industriesContent.exampleNotice)
    expect(screen.getAllByText("Illustrative example")).toHaveLength(4)
    expect(screen.getAllByText("What the caller says")).toHaveLength(4)
    expect(screen.getAllByText("What Telloya could ask")).toHaveLength(4)
    expect(screen.getAllByText("What the business receives")).toHaveLength(4)
    for (const [, title] of expected) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeInTheDocument()
    }
    const demoLinks = screen.getAllByRole("link", { name: personalisedDemoOffer.cta })
    expect(demoLinks.length).toBeGreaterThanOrEqual(4)
    for (const link of demoLinks) {
      expect(link).toHaveAttribute("href", "/enquire?intent=personalised-demo")
    }
    expect(screen.getByRole("link", { name: "Enquire now" })).toHaveAttribute("href", "/enquire")
    expect(screen.getByText("Emergency burst pipe")).toBeInTheDocument()
    expect(screen.getByText("Annual service")).toBeInTheDocument()
    expect(screen.getByText("New installation")).toBeInTheDocument()
    expect(screen.getByText("Planned maintenance")).toBeInTheDocument()
  })
})
