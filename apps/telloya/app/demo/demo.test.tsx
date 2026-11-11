/** @vitest-environment jsdom */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import { isSitePublic } from "@/lib/config"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import {
  DEMO_DISCLOSURE,
  DEMO_SCRIPT_VERSION,
  DEMO_SUMMARY_INDEX,
  demoBeats,
  demoLead,
  demoPageCopy,
  demoLiveStatus,
  nextDemoPosition,
  previousDemoPosition,
} from "@/lib/demo-script"
import HomePage from "@/app/page"
import HowItWorks from "@/app/how-it-works/page"
import DemoPage from "@/app/demo/page"

const demoDir = resolve(process.cwd(), "app/demo")

afterEach(() => {
  cleanup()
})

function renderedText() {
  return document.body.textContent ?? ""
}

describe("demo script transitions", () => {
  it("uses a business-first virtual receptionist and keeps the fiction note on the walkthrough", () => {
    const greeting = demoBeats.find((beat) => beat.id === "greet")
    expect(greeting?.kind).toBe("line")
    if (greeting?.kind === "line") {
      expect(greeting.text).toMatch(/virtual receptionist/)
      expect(greeting.text).not.toMatch(/\bAI\b/)
    }
    const reply = demoBeats.find((beat) => beat.id === "accept")
    expect(reply?.kind).toBe("line")
    if (reply?.kind === "line") expect(reply.text).toBe("Yes, please.")
    expect(demoPageCopy.fictionNote).toMatch(/interactive example/)
    expect(demoPageCopy.fictionNote).toMatch(/not the film/)
  })

  it("moves forward, back, and stops on the summary", () => {
    expect(nextDemoPosition(-1)).toBe(0)
    expect(previousDemoPosition(0)).toBe(0)
    expect(previousDemoPosition(-1)).toBe(-1)
    let position = 0
    for (let step = 0; step < DEMO_SUMMARY_INDEX; step += 1) position = nextDemoPosition(position)
    expect(position).toBe(DEMO_SUMMARY_INDEX)
    expect(nextDemoPosition(position)).toBe(DEMO_SUMMARY_INDEX)
    expect(previousDemoPosition(position)).toBe(DEMO_SUMMARY_INDEX - 1)
    expect(demoLiveStatus(-1)).toMatch(/Sample ready/)
    expect(demoLiveStatus(DEMO_SUMMARY_INDEX)).toMatch(/Lead summary/)
  })
})

describe("/demo illustrative sample", () => {
  it("renders the illustration instead of redirecting to enquire", () => {
    render(<DemoPage />)
    expect(screen.getByRole("heading", { level: 1, name: "See how Telloya works" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Explore the conversation step by step" })).toBeInTheDocument()
    expect(screen.getByText("From missed call to meaningful follow-up.")).toBeInTheDocument()
    expect(screen.getByText("Featured demonstration")).toBeInTheDocument()
    expect(screen.getByText("Click to play the demonstration video")).toBeInTheDocument()
    expect(screen.getByText("Illustrative demonstration featuring fictional characters and enquiries.")).toBeInTheDocument()
    expect(screen.getByRole("note")).toHaveTextContent(DEMO_DISCLOSURE)
    expect(screen.getAllByRole("link", { name: "Explore Pricing" }).every((link) => link.getAttribute("href") === "/pricing")).toBe(true)
    expect(screen.getByRole("heading", { name: "Experience Telloya answering calls for your business" })).toBeInTheDocument()
    expect(screen.getByText("Tell us about your business and what you'd like your AI receptionist to say. We'll prepare a personalised demonstration and arrange a time for you to call our demo number.")).toBeInTheDocument()
    expect(screen.getByText("The film and walkthrough are illustrative examples. A personalised demonstration is a real AI telephone conversation, using our demonstration number, arranged after your enquiry.")).toBeInTheDocument()
    expect(screen.getByText("We'll contact you with a suitable time and our demonstration number.")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Request a personalised demo" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Request a personalised demo" })).toHaveAttribute("href", "/enquire?intent=personalised-demo")
    expect(screen.getByRole("link", { name: "Enquire about Telloya" })).toHaveAttribute("href", "/enquire")
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy#demonstrations")
    expect(renderedText()).toContain("How that demonstration call is handled is explained in the privacy notice.")
    expect(renderedText()).not.toMatch(/has not been verified|completely unverified|10 minutes|never used for training|no data is ever/i)
    expect(screen.queryByRole("link", { name: "Enquire About Telloya" })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "See whether Telloya fits the way you work" })).not.toBeInTheDocument()
    expect(document.querySelector("[data-script-version]")).toHaveAttribute("data-script-version", DEMO_SCRIPT_VERSION)
    expect(renderedText()).not.toMatch(/does not record audio|without audio|silent/i)
  })

  it("starts, advances, goes back, replays, and opens the lead summary", () => {
    render(<DemoPage />)
    const start = screen.getByRole("button", { name: "Start the sample" })
    const next = screen.getByRole("button", { name: "Next step" })
    const previous = screen.getByRole("button", { name: "Previous step" })
    const replay = screen.getByRole("button", { name: "Replay from the beginning" })
    expect(start).toBeEnabled()
    expect(next).toBeDisabled()
    expect(previous).toBeDisabled()
    expect(replay).toBeDisabled()
    expect(screen.queryByText(demoBeats[0].kind === "scene" ? demoBeats[0].title : "")).not.toBeInTheDocument()

    fireEvent.click(start)
    expect(start).toBeDisabled()
    expect(next).toHaveFocus()
    expect(screen.getByRole("heading", { name: "A customer calls during a job" })).toBeInTheDocument()
    expect(screen.getByText("Step 1 of 8")).toBeInTheDocument()

    fireEvent.click(next)
    expect(screen.getByRole("heading", { name: "The unanswered call is forwarded" })).toBeInTheDocument()
    fireEvent.click(previous)
    expect(screen.getByRole("heading", { name: "A customer calls during a job" })).toBeInTheDocument()

    fireEvent.click(replay)
    expect(start).toBeEnabled()
    expect(start).toHaveFocus()
    expect(screen.queryByRole("heading", { name: "A customer calls during a job" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "View the lead summary" }))
    expect(screen.getByRole("heading", { name: "Lead summary for Hartley Plumbing" })).toHaveFocus()
    expect(screen.getByText(demoLead.serviceRequested)).toBeInTheDocument()
    expect(screen.getByText(demoLead.problem)).toBeInTheDocument()
    expect(screen.getByText(demoLead.approximateLocation)).toBeInTheDocument()
    expect(screen.getByText(demoLead.callbackNumberStatus)).toBeInTheDocument()
    expect(screen.getByText(demoLead.preferredCallbackWindow)).toBeInTheDocument()
    expect(next).toBeDisabled()

    fireEvent.click(previous)
    expect(screen.queryByRole("heading", { name: "Lead summary for Hartley Plumbing" })).not.toBeInTheDocument()
    const closing = demoBeats[DEMO_SUMMARY_INDEX - 1]
    expect(closing.kind).toBe("line")
    if (closing.kind === "line") expect(screen.getByText(closing.text)).toBeInTheDocument()
  })

  it("reaches the same summary by stepping through the fixed script", () => {
    render(<DemoPage />)
    fireEvent.click(screen.getByRole("button", { name: "Start the sample" }))
    const next = screen.getByRole("button", { name: "Next step" })
    for (let step = 0; step < DEMO_SUMMARY_INDEX; step += 1) fireEvent.click(next)
    expect(screen.getByText("Kitchen tap dripping into the sink")).toBeInTheDocument()
    expect(renderedText()).toMatch(/No visit is booked/)
    expect(renderedText()).not.toMatch(/appointment confirmed|booking confirmed|visit confirmed/i)
  })

  it("keeps every spoken line fictional, static, and free of a telephone number", () => {
    const published = JSON.stringify({ demoBeats, demoLead, DEMO_DISCLOSURE })
    expect(published).toMatch(/Alex Rowan/)
    expect(published).toMatch(/Hartley Plumbing/)
    expect(published).toMatch(/dripping/)
    expect(published).toMatch(/fictional/i)
    expect(published).not.toMatch(/\+?\d[\d\s().-]{7,}\d/)
    expect(published).not.toMatch(/\b(?:\+44|07\d{9})\b/)
    expect(published).not.toMatch(/recording|transcript|call history|usage tracking|Retell|Twilio|Stripe|Supabase/i)

    render(<DemoPage />)
    fireEvent.click(screen.getByRole("button", { name: "Start the sample" }))
    const next = screen.getByRole("button", { name: "Next step" })
    for (const beat of demoBeats) {
      const expected = beat.kind === "scene" ? beat.title : beat.text
      expect(screen.getByText(expected)).toBeInTheDocument()
      fireEvent.click(next)
    }
  })

  it("does not call the network or render a data-entry control", () => {
    const calls: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = ((input: unknown) => {
      calls.push(String(input))
      return Promise.reject(new Error("demo must not fetch"))
    }) as typeof fetch
    try {
      const { container } = render(<DemoPage />)
      fireEvent.click(screen.getByRole("button", { name: "Start the sample" }))
      fireEvent.click(screen.getByRole("button", { name: "View the lead summary" }))
      expect(calls).toEqual([])
      expect(container.querySelector("form, input, textarea, select")).toBeNull()
    } finally {
      globalThis.fetch = original
    }

    const source = ["page.tsx", "demo-player.tsx", "../../lib/demo-script.ts"]
      .map((file) => readFileSync(resolve(demoDir, file), "utf8"))
      .join("\n")
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|retell|twilio|stripe|supabase|mediaDevices/i)
    expect(source).not.toMatch(/gtag|googletagmanager|sendTelloyaLeadConversion|generate_lead|dataLayer/)
  })

  it("exposes named controls, moves focus, and accepts arrow keys", () => {
    render(<DemoPage />)
    const names = [
      "Start the sample",
      "Next step",
      "Previous step",
      "Replay from the beginning",
      "View the lead summary",
    ]
    for (const name of names) {
      const button = screen.getByRole("button", { name })
      expect(button).toHaveAttribute("type", "button")
    }
    const player = screen.getByRole("region", { name: "Sample conversation" })
    fireEvent.keyDown(player, { key: "ArrowRight" })
    expect(screen.getByRole("heading", { name: "A customer calls during a job" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next step" })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole("button", { name: "Next step" }), { key: "ArrowRight" })
    expect(screen.getByRole("heading", { name: "The unanswered call is forwarded" })).toBeInTheDocument()
    fireEvent.keyDown(player, { key: "ArrowLeft" })
    expect(screen.getByRole("heading", { name: "A customer calls during a job" })).toBeInTheDocument()
  })

  it("keeps the sample readable when motion is reduced", () => {
    const css = readFileSync(resolve(demoDir, "demo.module.css"), "utf8")
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/animation:\s*none !important/)
    expect(css).toMatch(/\.beat,\s*\.summary \{[^}]*opacity:\s*1/)
    expect(css).toMatch(/\.controls button:focus/)
    expect(css).toMatch(/\.summary \.sceneTitle:focus/)
    render(<DemoPage />)
    expect(screen.getByRole("note")).toBeVisible()
    expect(screen.getByText(DEMO_DISCLOSURE)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "View the lead summary" }))
    expect(screen.getByText(demoLead.serviceRequested)).toBeVisible()
  })

  it("defines desktop, tablet, and mobile layouts", () => {
    const css = readFileSync(resolve(demoDir, "demo.module.css"), "utf8")
    expect(css).toMatch(/grid-template-columns:\s*240px minmax\(0, 1fr\)/)
    expect(css).toMatch(/@media \(max-width: 1024px\)/)
    expect(css).toMatch(/@media \(max-width: 640px\)/)
    expect(css).toMatch(/flex-direction:\s*column/)
    expect(css).toMatch(/min-height:\s*44px/)
    expect(css).toMatch(/:focus-visible/)
  })
})

describe("demo links and launch boundaries", () => {
  it("links the homepage and how-it-works page without changing the homepage hero", () => {
    const { container, unmount } = render(<HomePage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Don't Let Missed Calls")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cost You Customers.")
    expect(screen.queryByText("Never Misses a Call")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /See how Telloya works/i })).toHaveAttribute("href", "/how-it-works")
    expect(screen.getAllByRole("link", { name: "Enquire about Telloya" }).every((link) => link.getAttribute("href") === "/enquire")).toBe(true)
    expect(container.querySelector("img")?.getAttribute("src")).toContain("telloya-cinematic-console")
    expect(screen.getByRole("link", { name: "See a Sample Conversation" })).toHaveAttribute("href", "/demo")
    unmount()

    render(<HowItWorks />)
    expect(screen.getByRole("link", { name: "See a Sample Conversation" })).toHaveAttribute("href", "/demo")
    expect(screen.getByRole("link", { name: /Enquire now/i })).toHaveAttribute("href", "/enquire")
  })

  it("keeps pre-launch indexing and enquiry submission closed", async () => {
    expect(getEnquiryCapabilities({}).submissionEnabled).toBe(false)
    expect(isSitePublic({})).toBe(false)
    expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" })).toBe(false)
    const sitemap = (await import("@/app/sitemap")).default
    const original = process.env
    process.env = { ...original, VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" }
    expect(sitemap()).toEqual([])
    process.env = { ...original, VERCEL_ENV: "preview", TELLOYA_LAUNCHED: "true" }
    expect(sitemap()).toEqual([])
    process.env = original
  })
})
