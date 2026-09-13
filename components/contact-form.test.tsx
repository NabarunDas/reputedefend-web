/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import {
  ContactForm,
  MESSAGE_HINT,
  SEND_ERROR,
  SIMULATED_COPY,
  SUCCESS_COPY,
} from "./contact-form"
import { CONTACT_SUBJECTS } from "@/lib/enquiry"

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>
  },
}))

const validMessage = "Could you explain how ProfileRelaunch assessments work before we start?"

function fillValid(overrides?: {
  name?: string
  email?: string
  businessName?: string
  subject?: string
  message?: string
}) {
  fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: overrides?.name ?? "Alex Morgan" } })
  fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: overrides?.email ?? "alex@example.com" } })
  fireEvent.change(screen.getByLabelText(/Business name/), { target: { value: overrides?.businessName ?? "" } })
  fireEvent.change(screen.getByLabelText(/^Subject$/), { target: { value: overrides?.subject ?? "general-question" } })
  fireEvent.change(screen.getByLabelText(/^Message$/), { target: { value: overrides?.message ?? validMessage } })
}

function submitForm() {
  fireEvent.click(screen.getByRole("button", { name: "Send message" }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("ContactForm", () => {
  it("keeps general-enquiry fields and does not add case-intake controls", () => {
    render(<ContactForm />)
    expect(screen.getByLabelText(/^Name$/)).toBeRequired()
    expect(screen.getByLabelText(/^Email$/)).toBeRequired()
    expect(screen.getByLabelText(/Business name/)).not.toBeRequired()
    expect(screen.getByText("Optional")).toBeInTheDocument()
    expect(screen.getByLabelText(/^Subject$/)).toBeRequired()
    expect(screen.getByLabelText(/^Message$/)).toBeRequired()
    expect(screen.getByText(MESSAGE_HINT)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy")
    expect(document.querySelector("input[type='file']")).toBeNull()
    expect(document.querySelector("input[type='password']")).toBeNull()
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/country/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/google business profile url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/review url/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/guided/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/managed/i)).not.toBeInTheDocument()
    expect(CONTACT_SUBJECTS.map((item) => item.value)).toEqual([
      "general-question",
      "service-question",
      "partnership",
      "media",
      "something-else",
    ])
    const subject = screen.getByLabelText(/^Subject$/) as HTMLSelectElement
    expect([...subject.options].map((option) => option.value)).toEqual([
      "",
      ...CONTACT_SUBJECTS.map((item) => item.value),
    ])
    expect([...subject.options].some((option) => /active profile suspension/i.test(option.textContent ?? ""))).toBe(false)
  })

  it("requires name, a valid email, subject and message", () => {
    render(<ContactForm />)
    submitForm()
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent(/name/i)
    expect(alert).toHaveTextContent(/email/i)
    expect(alert).toHaveTextContent(/subject/i)
    expect(alert).toHaveTextContent(/message/i)

    fillValid({ email: "not-an-email", subject: "", message: "" })
    submitForm()
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i)
    expect(screen.getByRole("alert")).toHaveTextContent(/subject/i)
    expect(screen.getByRole("alert")).toHaveTextContent(/message/i)
  })

  it("submits source contact with unchanged subject values and optional business name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<ContactForm />)
    fillValid({ businessName: "Harbour Bakery", subject: "partnership" })
    submitForm()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/enquiry")
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.source).toBe("contact")
    expect(body.fullName).toBe("Alex Morgan")
    expect(body.email).toBe("alex@example.com")
    expect(body.businessName).toBe("Harbour Bakery")
    expect(body.subject).toBe("partnership")
    expect(body.details).toBe(validMessage)
    expect(body.companyFax).toBe("")
    expect(body.phone).toBeUndefined()
    expect(body.service).toBeUndefined()
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
    expect(screen.getByText(SUCCESS_COPY.body)).toBeInTheDocument()
    expect(screen.queryByText(SIMULATED_COPY.kicker)).not.toBeInTheDocument()
  })

  it("accepts a message without a business name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<ContactForm />)
    fillValid()
    submitForm()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.businessName).toBe("")
    expect(body.subject).toBe("general-question")
  })

  it("keeps development simulation visually distinct from a live acknowledgement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, simulated: true }),
    }))
    render(<ContactForm />)
    fillValid()
    submitForm()
    await screen.findByText(SIMULATED_COPY.kicker)
    expect(screen.getByRole("heading", { name: SIMULATED_COPY.title })).toBeInTheDocument()
    expect(screen.getByText(SIMULATED_COPY.body)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: SUCCESS_COPY.title })).not.toBeInTheDocument()
  })

  it("preserves values when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false }),
    }))
    render(<ContactForm />)
    fillValid({ businessName: "Harbour Bakery" })
    submitForm()
    await screen.findByRole("alert")
    expect(screen.getByRole("alert")).toHaveTextContent(SEND_ERROR)
    expect(screen.getByLabelText(/^Name$/)).toHaveValue("Alex Morgan")
    expect(screen.getByLabelText(/^Email$/)).toHaveValue("alex@example.com")
    expect(screen.getByLabelText(/Business name/)).toHaveValue("Harbour Bakery")
    expect(screen.getByLabelText(/^Subject$/)).toHaveValue("general-question")
    expect(screen.getByLabelText(/^Message$/)).toHaveValue(validMessage)
    expect(screen.queryByRole("heading", { name: SUCCESS_COPY.title })).not.toBeInTheDocument()
  })

  it("disables submit while the request is in flight", async () => {
    let resolveFetch: ((value: { ok: boolean; json: () => Promise<{ ok: boolean }> }) => void) | undefined
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFetch = resolve
      }),
    ))
    render(<ContactForm />)
    fillValid()
    submitForm()
    const sending = await screen.findByRole("button", { name: "Sending…" })
    expect(sending).toBeDisabled()
    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true")
    resolveFetch?.({ ok: true, json: async () => ({ ok: true }) })
    await screen.findByRole("heading", { name: SUCCESS_COPY.title })
  })
})
