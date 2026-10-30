// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { LoginClient } from "@/app/login/login-client"
import { SignOutButton } from "@/app/portal/sign-out-button"
import { CustomerHeader } from "@/components/customer-header"

const nav = vi.hoisted(() => ({ pathname: "/" }))
const replaceDocument = vi.hoisted(() => vi.fn())
const reloadDocument = vi.hoisted(() => vi.fn())
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => router,
}))
vi.mock("@/lib/portal/account/document", () => ({
  replaceAuthenticatedDocument: replaceDocument,
  reloadAuthenticatedDocument: reloadDocument,
}))
vi.mock("next/image", () => ({
  default: ({ alt, src, className }: { alt: string; src: string; className?: string }) => (
    // Test double only. The app uses next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}))

const fetchMock = vi.fn()

function pageShow(persisted: boolean) {
  window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }))
}

async function verifyCode() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }),
  })
  render(<LoginClient />)
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "mina@example.com" } })
  fireEvent.click(screen.getByRole("button", { name: "Send code" }))
  const code = await screen.findByLabelText("Eight-digit code")
  fireEvent.change(code, { target: { value: "12345678" } })
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: "ok" }) })
  fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
  await waitFor(() => expect(replaceDocument).toHaveBeenCalledTimes(1))
}

beforeEach(() => {
  nav.pathname = "/"
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  replaceDocument.mockReset()
  reloadDocument.mockReset()
  router.push.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("customer identity across authentication", () => {
  it("loads a new portal document after a fresh login from an unauthenticated page", async () => {
    nav.pathname = "/login"
    render(<CustomerHeader />)
    expect(screen.getByRole("link", { name: "Back to ProfileRelaunch" })).toBeTruthy()
    expect(screen.queryByText("My account")).toBeNull()
    expect(screen.queryByText("Aarshav Das")).toBeNull()
    cleanup()

    await verifyCode()
    expect(replaceDocument).toHaveBeenCalledWith("portal")
    expect(router.push).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("does not leave the login page when the code is rejected", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "sent" }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ status: "rejected" }) })
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "mina@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    const code = await screen.findByLabelText("Eight-digit code")
    fireEvent.change(code, { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(replaceDocument).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("does not navigate from a painted preview", () => {
    render(<LoginClient preview={{ phase: "done", email: "mina@example.com" }} />)
    expect(screen.getByRole("heading", { name: "You're signed in" })).toBeTruthy()
    expect(replaceDocument).not.toHaveBeenCalled()
  })

  it("shows the name supplied for the initial authenticated portal document", () => {
    nav.pathname = "/portal"
    render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByText("Aarshav Das")).toBeTruthy()
    expect(screen.queryByText("My account")).toBeNull()
    expect(screen.queryByText("Mina Cole")).toBeNull()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("keeps that document's name when moving between portal pages", () => {
    nav.pathname = "/portal"
    const view = render(<CustomerHeader accountName="Aarshav Das" />)
    nav.pathname = "/portal/payments"
    view.rerender(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByText("Aarshav Das")).toBeTruthy()
    nav.pathname = "/portal/cases"
    view.rerender(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByText("Aarshav Das")).toBeTruthy()
    expect(screen.queryByText("My account")).toBeNull()
  })

  it("uses the neutral fallback when this document has no account name", () => {
    nav.pathname = "/login"
    const view = render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.queryByText("Aarshav Das")).toBeNull()
    nav.pathname = "/portal"
    view.rerender(<CustomerHeader accountName={null} />)
    expect(screen.getByText("My account")).toBeTruthy()
    expect(screen.queryByText("Aarshav Das")).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it("reloads a document restored from the back-forward cache", () => {
    nav.pathname = "/portal"
    render(<CustomerHeader accountName="Aarshav Das" />)
    pageShow(false)
    expect(reloadDocument).not.toHaveBeenCalled()
    pageShow(true)
    expect(reloadDocument).toHaveBeenCalledTimes(1)
  })

  it("loads a new login document on sign-out and does not navigate when sign-out fails", async () => {
    nav.pathname = "/portal"
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    const view = render(<><CustomerHeader accountName="Aarshav Das" /><SignOutButton /></>)
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith("login"))
    expect(router.push).not.toHaveBeenCalled()
    view.unmount()

    replaceDocument.mockClear()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't sign you out. Try again."))
    expect(replaceDocument).not.toHaveBeenCalled()
  })

  it("shows only the next customer after sign-out and a new portal document", async () => {
    nav.pathname = "/portal"
    const first = render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.getByText("Aarshav Das")).toBeTruthy()
    first.unmount()

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith("login"))
    cleanup()

    nav.pathname = "/login"
    render(<CustomerHeader accountName="Aarshav Das" />)
    expect(screen.queryByText("Aarshav Das")).toBeNull()
    cleanup()

    replaceDocument.mockClear()
    await verifyCode()
    expect(replaceDocument).toHaveBeenCalledWith("portal")
    cleanup()

    nav.pathname = "/portal"
    render(<CustomerHeader accountName="Mina Cole" />)
    expect(screen.getByText("Mina Cole")).toBeTruthy()
    expect(screen.queryByText("Aarshav Das")).toBeNull()
    expect(screen.queryByText("My account")).toBeNull()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
