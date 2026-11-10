/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it } from "vitest"
import HomePage from "@/app/page"
import DemoPage from "@/app/demo/page"
import { TelloyaStreamPlayer } from "@/components/telloya-stream-player"
import { telloyaStreamPlayer } from "@/lib/telloya-stream"

afterEach(() => {
  cleanup()
})

describe("Telloya Stream player", () => {
  it("keeps the approved iframe out of the page until Play is activated", () => {
    render(<TelloyaStreamPlayer />)
    expect(screen.queryByTitle(telloyaStreamPlayer.title)).not.toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: telloyaStreamPlayer.playLabel }))
    const frame = screen.getByTitle(telloyaStreamPlayer.title)
    expect(frame).toHaveAttribute("src", telloyaStreamPlayer.iframeSrc)
    expect(frame.getAttribute("src")).not.toMatch(/autoplay=|loop=true|muted=true|youtube|vimeo/i)
    expect(frame).toHaveAttribute("allow", telloyaStreamPlayer.allow)
    expect(frame).toHaveAttribute("allowfullscreen")
    expect(telloyaStreamPlayer.iframeSrc.startsWith(`${telloyaStreamPlayer.frameOrigin}/`)).toBe(true)
  })

  it("adds a homepage preview without replacing the hero, and keeps the interactive demo", () => {
    const { unmount } = render(<HomePage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Don't Let Missed Calls")
    expect(screen.getByRole("heading", { name: /See Telloya in action/i })).toBeInTheDocument()
    expect(screen.getByText("See how Telloya helps businesses respond to missed-call enquiries while they stay focused on their work.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Try the interactive sample/i })).toHaveAttribute("href", "/demo")
    expect(document.querySelector("iframe")).toBeNull()
    unmount()

    render(<DemoPage />)
    expect(screen.getByRole("heading", { level: 1, name: "See Telloya in Action" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Watch the illustrative film" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Start the sample" })).toBeEnabled()
    expect(screen.getByText(/not a recording of a real customer/i)).toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
  })
})
