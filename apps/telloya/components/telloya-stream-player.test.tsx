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
    expect(frame).toHaveAttribute("src", telloyaStreamPlayer.playbackSrc)
    expect(telloyaStreamPlayer.playbackSrc.startsWith(`${telloyaStreamPlayer.iframeSrc}&autoplay=true`)).toBe(true)
    expect(frame.getAttribute("src")).not.toMatch(/loop=true|muted=true|defaultTextTrack|youtube|vimeo/i)
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
    expect(document.querySelector("img[src='/brand/telloya-cinematic-console.webp']")).toBeTruthy()
    expect(document.querySelector("img[src='/demo/telloya-film-poster.webp']")).toBeNull()
    expect(screen.queryByText("Featured demonstration")).not.toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
    unmount()

    render(<DemoPage />)
    expect(screen.getByRole("heading", { level: 1, name: "See how Telloya works" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Explore the conversation step by step" })).toBeInTheDocument()
    expect(document.querySelector("img[src='/demo/telloya-film-poster.webp']")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start the sample" })).toBeEnabled()
    expect(screen.getByText("Featured demonstration")).toBeInTheDocument()
    expect(screen.getByText("Click to play the demonstration video")).toBeInTheDocument()
    expect(screen.getByText("Illustrative demonstration featuring fictional characters and enquiries.")).toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
  })
})
