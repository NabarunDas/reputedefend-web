// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { validateTelloyaEnquiry } from "@/lib/telloya-enquiry"
import { commercialCopy, formatGbpPrice, formatMinutes, telloyaPlans } from "@/lib/pricing"
import { TelloyaEnquiryForm } from "./telloya-enquiry-form"

afterEach(() => cleanup())

describe("Telloya enquiry form commercial labels", () => {
  it("shows an advertised fixed-plan plus Guard total and keeps the Guard entitlement limit", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="growth" />)
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), { target: { value: "2" } })
    expect(screen.getByText(/Advertised monthly total: £98\.98/)).toBeInTheDocument()
    expect(screen.getAllByText(/Additional Guard-only locations do not create additional receptionist entitlements/).length).toBeGreaterThan(0)
  })

  it("keeps Custom monthly calls optional", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="custom" />)
    const calls = screen.getByRole("spinbutton", { name: /Expected calls per month/ }) as HTMLInputElement
    expect(calls).not.toBeRequired()
    expect(calls.labels?.[0]?.textContent).toMatch(/Optional/)
  })

  it("marks the overage cap required only after additional-minute interest is selected", () => {
    render(<TelloyaEnquiryForm capabilities={{ submissionEnabled: true }} initialPlanTier="basic" />)
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.queryByRole("spinbutton", { name: /Proposed monthly cap/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    expect(screen.queryByRole("spinbutton", { name: /Proposed monthly cap/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Interested in additional minutes/ }))
    const cap = screen.getByRole("spinbutton", { name: /Proposed monthly cap/ }) as HTMLInputElement
    expect(cap).toBeRequired()
    expect(cap.labels?.[0]?.textContent ?? "").not.toMatch(/Optional/)
  })
})

const enabled = { submissionEnabled: true as const }
const reference = "TY-26-ABCDEF"

function renderEnabled(
  initialPlanTier: "" | "basic" | "growth" | "pro" | "custom" = "growth",
  initialGuardInterested = false,
  initialRequestIntent: "personalised-demo" | "" = "",
) {
  return render(
    <TelloyaEnquiryForm
      capabilities={enabled}
      initialPlanTier={initialPlanTier}
      initialGuardInterested={initialGuardInterested}
      initialRequestIntent={initialRequestIntent}
    />,
  )
}

function fillContact() {
  fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: "Harbour Plumbing" } })
  const country = screen.getByRole("combobox", { name: /^Country/ })
  fireEvent.change(country, { target: { value: "United Kingdom" } })
  fireEvent.blur(country)
  fireEvent.change(screen.getByRole("combobox", { name: /Business type or trade/ }), { target: { value: "Plumbing" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Contact name/ }), { target: { value: "Ada Lovelace" } })
  fireEvent.change(screen.getByRole("textbox", { name: /^Email/ }), { target: { value: "ada@example.com" } })
  fireEvent.change(screen.getByRole("textbox", { name: /Phone number/ }), { target: { value: "+447700900123" } })
  fireEvent.click(screen.getByRole("checkbox", { name: /privacy notice/ }))
}

describe("Telloya short enquiry journey", () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("does not submit or show contact errors after one Continue click", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderEnabled("")
    const form = document.querySelector("form")
    const submits: Event[] = []
    form?.addEventListener("submit", (event) => submits.push(event))
    const continueButton = screen.getByRole("button", { name: /Continue/ })
    expect(continueButton).toHaveAttribute("type", "button")
    fireEvent.click(continueButton)
    expect(submits).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(continueButton).toHaveAttribute("type", "button")
    const submit = screen.getByRole("button", { name: "Submit enquiry" })
    expect(submit).toHaveAttribute("type", "submit")
    expect(submit).not.toBe(continueButton)
    expect(screen.getByRole("heading", { name: "Your business and contact details" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText("Please enter your business name.")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /Business name/ })).toHaveValue("")
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your business and contact details" }))
    fireEvent.click(submit)
    expect(submits).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your business name.")
    expect(screen.getByRole("heading", { name: "Your business and contact details" })).toBeInTheDocument()
  })

  it("keeps a selected plan when Continue moves to contact details", () => {
    renderEnabled("growth")
    const continueButton = screen.getByRole("button", { name: /Continue/ })
    fireEvent.click(continueButton)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByText("Growth")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Submit enquiry" })).not.toBe(continueButton)
  })

  it.each(["basic", "growth", "pro", "custom"] as const)("preselects %s from the plan parameter", (plan) => {
    renderEnabled(plan)
    expect(screen.getByRole("radio", { name: new RegExp(`^${plan}`, "i") })).toBeChecked()
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "2")
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1")
  })

  it("asks for Guard locations only after interest, and keeps the count when editing the service", () => {
    renderEnabled("pro")
    expect(screen.queryByRole("spinbutton", { name: /How many locations need Guard protection/ })).not.toBeInTheDocument()
    expect(screen.getByText(/£120 per month and includes 500 minutes\/month/)).toBeInTheDocument()
    expect(screen.getByText(/We'll confirm pricing and compatibility with you before you decide whether to proceed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    const locations = screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })
    fireEvent.change(locations, { target: { value: "3" } })
    expect(screen.getByText(/Advertised monthly total: £149\.97/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.click(screen.getByRole("button", { name: /Edit Your service/ }))
    expect(screen.getByRole("radio", { name: /Pro/ })).toBeChecked()
    expect(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })).toHaveValue(3)
  })

  it("requires the minimum Custom quotation fields and leaves calls optional", () => {
    renderEnabled("custom")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please enter monthly minutes required.")
    expect(summary).toHaveTextContent("Please enter the number of phone numbers.")
    expect(summary).toHaveTextContent("Please enter the number of locations.")
    expect(summary).not.toHaveTextContent("calls")
    fireEvent.change(screen.getByRole("spinbutton", { name: /Monthly minutes needed/ }), { target: { value: "1000" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /Phone numbers needed/ }), { target: { value: "2" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /Number of locations/ }), { target: { value: "4" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), { target: { value: "2" } })
    expect(screen.getByText(/Advertised Guard amount: £19\.98/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("heading", { name: /Your business and contact details/ })).toBeInTheDocument()
  })

  it("requires business, contact and privacy details, and keeps optional details collapsed", () => {
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.queryByRole("textbox", { name: /missed-call challenge/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /current phone setup/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please enter your business name.")
    expect(summary).toHaveTextContent("Please choose the country where your business is located.")
    expect(summary).toHaveTextContent("Please choose your business type.")
    expect(summary).toHaveTextContent("Please enter your name.")
    expect(summary).toHaveTextContent("Please enter a valid email address.")
    expect(summary).toHaveTextContent("Please enter a valid phone number.")
    expect(summary).toHaveTextContent("Please confirm you have read the privacy notice.")
    expect(screen.getByRole("link", { name: "privacy notice" })).toHaveAttribute("href", "/privacy")
    expect(summary).not.toHaveTextContent("phone setup")
    expect(screen.getByText("Review your selected plan, then tell us how to contact you.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Please enter your business name." }))
    expect(document.activeElement).toHaveAttribute("name", "businessName")
  })

  it("keeps entered details when moving back and forward", () => {
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.change(screen.getByRole("textbox", { name: /Business name/ }), { target: { value: "Harbour Plumbing" } })
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    fireEvent.change(screen.getByRole("textbox", { name: /current phone setup/ }), { target: { value: "Mobile" } })
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect(screen.getByRole("radio", { name: /Growth/ })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("textbox", { name: /Business name/ })).toHaveValue("Harbour Plumbing")
    expect(screen.getByRole("textbox", { name: /current phone setup/ })).toHaveValue("Mobile")
  })

  it("shows a persisted TY reference and the acknowledgement email status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus: "sent",
        message: "Your enquiry has been received.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByRole("heading", { name: /we have received your enquiry/i })).toBeInTheDocument()
    expect(screen.getByText(reference)).toBeInTheDocument()
    expect(screen.getByText("Our team will review your enquiry and get in touch using the details you provided.")).toBeInTheDocument()
    expect(screen.queryByText(/personalised Telloya demonstration/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Admin will review it/)).not.toBeInTheDocument()
    expect(screen.getByText(/does not confirm the message has arrived in your inbox/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copy reference" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reference))
  })

  it.each([
    ["suppressed", /No confirmation email was requested/],
    ["unavailable", /could not send a confirmation email/],
  ] as const)("presents a %s acknowledgement email accurately", async (receiptEmailStatus, copy) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus,
        message: "Your enquiry has been received.",
      }),
    }))
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByText(copy)).toBeInTheDocument()
    expect(screen.getByText(reference)).toBeInTheDocument()
  })

  it("does not show success for HTTP 200 without a persisted TY reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, message: "Your enquiry has been received.", leadConversion: true }),
    }))
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to complete this enquiry right now.")
    expect(screen.queryByRole("heading", { name: /we have received your enquiry/i })).not.toBeInTheDocument()
  })

  it("ignores a second submit while the first request is in flight", async () => {
    let release: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      release = resolve
    }))
    vi.stubGlobal("fetch", fetchMock)
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    const submit = screen.getByRole("button", { name: "Submit enquiry" })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
    release({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus: "sent",
      }),
    })
    expect(await screen.findByText(reference)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps online submission closed and explains that no payment is taken", () => {
    render(<TelloyaEnquiryForm />)
    expect(screen.getByRole("status")).toHaveTextContent(/enquiry system before public launch/i)
    expect(screen.getByRole("heading", { level: 2, name: /Online enquiry submission is being prepared/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Submit enquiry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /Growth/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "compare the plans" })).not.toBeInTheDocument()
  })

  it("uses a mobile-first layout and accessible progress", () => {
    const css = readFileSync(resolve(process.cwd(), "components/telloya-enquiry-form.module.css"), "utf8")
    expect(css).toMatch(/@media \(max-width: 480px\)/)
    expect(css).toMatch(/flex-direction:\s*column-reverse/)
    renderEnabled("")
    const progress = screen.getByRole("progressbar")
    expect(progress).toHaveAttribute("aria-valuemin", "1")
    expect(progress).toHaveAttribute("aria-valuemax", "2")
    expect(screen.queryByRole("group", { name: /Choose your Telloya plan/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /I know what I need/ }))
    expect(screen.getByRole("group", { name: /Choose your Telloya plan/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please select a plan.")
    const planGroup = screen.getByRole("group", { name: /Choose your Telloya plan/ })
    expect(planGroup).toHaveAttribute("aria-invalid", "true")
    expect(planGroup.getAttribute("aria-describedby")).toMatch(/planTier-error$/)
    fireEvent.click(screen.getByRole("button", { name: "Please select a plan." }))
    expect(document.activeElement?.id).toMatch(/planTier$/)
  })

  it("associates the privacy confirmation error with the checkbox", () => {
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fillContact()
    fireEvent.click(screen.getByRole("checkbox", { name: /privacy notice/ }))
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    const privacy = screen.getByRole("checkbox", { name: /privacy notice/ })
    expect(privacy).toHaveAttribute("aria-invalid", "true")
    expect(privacy.getAttribute("aria-describedby")).toMatch(/privacyAccepted-error$/)
    expect(document.getElementById(privacy.getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Please confirm you have read the privacy notice.",
    )
  })

  it("preserves a legacy complete-link Guard preference until a plan is chosen", () => {
    renderEnabled("", true)
    fireEvent.click(screen.getByRole("radio", { name: /Basic/ }))
    expect(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ })).toBeChecked()
    expect(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })).toBeInTheDocument()
  })

  it("preselects Basic, Growth, Pro and Custom and keeps Guard optional", () => {
    for (const tier of ["basic", "growth", "pro", "custom"] as const) {
      cleanup()
      renderEnabled(tier)
      expect(screen.getByRole("radio", { name: new RegExp(`^${tier}`, "i") })).toBeChecked()
      expect(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ })).not.toBeChecked()
    }
  })

  it("collects Custom locations and numbers as a quotation and keeps voice fields optional", () => {
    renderEnabled("custom")
    expect(screen.getByText(/quoted individually for requirements outside the standard plans/i)).toBeInTheDocument()
    expect(screen.getByText(/best estimate of the monthly minutes, receptionist numbers and operating locations/i)).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: /Phone numbers needed/ })).toBeRequired()
    expect(screen.getByRole("spinbutton", { name: /^Number of locations/ })).toBeRequired()
    expect(screen.getByRole("textbox", { name: /Language preferences/ })).not.toBeRequired()
    fireEvent.change(screen.getByRole("spinbutton", { name: /Monthly minutes needed/ }), { target: { value: "1000" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /Phone numbers needed/ }), { target: { value: "2" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Number of locations/ }), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    expect(screen.getByRole("combobox", { name: /Voice preference/ })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /Preferred accent/ })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /Primary language/ })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: /Speaking style/ })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /Additional languages/ })).toBeInTheDocument()
    expect(screen.getByText(/not guaranteed offerings/i)).toBeInTheDocument()
  })

  it("states that overage interest is not a charge and that a spending cap is required", () => {
    renderEnabled("pro")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    expect(screen.getByText(/Interest is not authorisation to charge/i)).toBeInTheDocument()
    expect(screen.getByText(/customer-defined monthly spending cap/i)).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /Interested in additional minutes/ })).not.toBeChecked()
  })
})

describe("Telloya enquiry guidance copy", () => {
  it("explains plan selection and links compare the plans to pricing", () => {
    renderEnabled()
    expect(screen.getByText(/Choose the plan that best matches your expected monthly call minutes/)).toBeInTheDocument()
    expect(screen.getByText(/Need more locations, receptionist numbers or a different allowance\? Choose Custom\./)).toBeInTheDocument()
    const link = screen.getByRole("link", { name: "compare the plans" })
    expect(link).toHaveAttribute("href", "/pricing")
    expect(link.closest("p")).toHaveTextContent("You can compare the plans before deciding.")
  })

  it("builds each standard plan description from canonical commercial data", () => {
    for (const plan of telloyaPlans) {
      if (plan.monthlyPriceGbp == null || plan.minutesPerMonth == null) continue
      cleanup()
      renderEnabled(plan.tier)
      const description = screen.getByText((_, node) => {
        if (node?.tagName !== "P") return false
        const text = node.textContent ?? ""
        return text.includes(`${plan.name} is ${formatGbpPrice(plan.monthlyPriceGbp!)} per month and includes ${formatMinutes(plan.minutesPerMonth!)}.`)
          && text.includes(commercialCopy.standardEntitlement)
          && text.includes(commercialCopy.extraReceptionist)
          && text.includes("We'll confirm pricing and compatibility with you before you decide whether to proceed.")
      })
      expect(description).toBeInTheDocument()
    }
  })

  it("asks for Custom estimates without making monthly calls required", () => {
    renderEnabled("custom")
    expect(screen.getByText(/Enter your best estimate of the monthly minutes, receptionist numbers and operating locations you need/)).toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: /Monthly minutes needed/ })).toBeRequired()
    expect(screen.getByRole("spinbutton", { name: /Phone numbers needed/ })).toBeRequired()
    expect(screen.getByRole("spinbutton", { name: /^Number of locations/ })).toBeRequired()
    expect(screen.getByRole("spinbutton", { name: /Expected calls per month/ })).not.toBeRequired()
    expect(screen.queryByRole("checkbox", { name: /not sure/i })).not.toBeInTheDocument()
  })
})

describe("Telloya progressive enquiry journey", () => {
  it("starts on Help me choose and hides the plan selector", () => {
    renderEnabled("")
    expect(screen.getByRole("radio", { name: /Help me choose a plan/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: /I know what I need/ })).not.toBeChecked()
    expect(screen.getByText(/You don't need to know your monthly call minutes yet/)).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /Basic/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /Growth/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /Add Relaunch Guard monitoring/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("spinbutton", { name: /Monthly minutes needed/ })).not.toBeInTheDocument()
  })

  it("advances Help me choose without a plan and keeps contact and privacy requirements", () => {
    renderEnabled("")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("heading", { name: /Your business and contact details/ })).toBeInTheDocument()
    expect(screen.getByText("Help me choose")).toBeInTheDocument()
    expect(screen.getByText("Our team will discuss your requirements and help you choose a suitable plan.")).toBeInTheDocument()
    expect(screen.queryByText(/per month, indicative/)).not.toBeInTheDocument()
    expect(screen.queryByText(/minutes\/month/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    const summary = screen.getByRole("alert")
    expect(summary).toHaveTextContent("Please enter your business name.")
    expect(summary).toHaveTextContent("Please confirm you have read the privacy notice.")
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    expect(screen.queryByRole("checkbox", { name: /Interested in additional minutes/ })).not.toBeInTheDocument()
  })

  it.each(["basic", "growth", "pro", "custom"] as const)("opens %s from a pricing preselection on the detailed pathway", (tier) => {
    renderEnabled(tier)
    expect(screen.getByRole("radio", { name: /I know what I need/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: new RegExp(`^${tier}`, "i") })).toBeChecked()
    const plan = telloyaPlans.find((item) => item.tier === tier)
    expect(plan).toBeTruthy()
    if (plan?.monthlyPriceGbp != null) {
      expect(screen.getByText(new RegExp(`${formatGbpPrice(plan.monthlyPriceGbp)}/month`))).toBeInTheDocument()
    } else {
      expect(screen.getByText(/Contact for quotation/)).toBeInTheDocument()
    }
  })

  it("keeps a legacy Complete link on the detailed pathway with Guard interest", () => {
    renderEnabled("", true)
    expect(screen.getByRole("radio", { name: /I know what I need/ })).toBeChecked()
    expect(screen.getByRole("radio", { name: /Basic/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /Growth/ }))
    expect(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ })).toBeChecked()
  })

  it("submits a product-only enquiry and drops stale detailed choices", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        enquiryRef: reference,
        leadConversion: false,
        receiptEmailStatus: "sent",
        message: "Your enquiry has been received.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("checkbox", { name: /Add Relaunch Guard monitoring/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ }), { target: { value: "2" } })
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.click(screen.getByRole("button", { name: "Optional details" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Interested in additional minutes/ }))
    fireEvent.change(screen.getByRole("spinbutton", { name: /Proposed monthly cap/ }), { target: { value: "40" } })
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    fireEvent.click(screen.getByRole("radio", { name: /Help me choose a plan/ }))
    expect(screen.queryByRole("radio", { name: /Growth/ })).not.toBeInTheDocument()
    expect(screen.queryByText("Please select a plan.")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /I know what I need/ }))
    expect(screen.getByRole("radio", { name: /Growth/ })).toBeChecked()
    expect(screen.getByRole("spinbutton", { name: /How many locations need Guard protection/ })).toHaveValue(2)
    fireEvent.click(screen.getByRole("radio", { name: /Help me choose a plan/ }))
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("textbox", { name: /Business name/ })).toHaveValue("Harbour Plumbing")
    expect(screen.getByText("Help me choose")).toBeInTheDocument()
    expect(screen.queryByText("£79 per month, indicative")).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /current phone setup/ })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /Interested in additional minutes/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    await screen.findByRole("heading", { name: /we have received your enquiry/i })
    expect(screen.getByText("Our team will review your enquiry and get in touch using the details you provided.")).toBeInTheDocument()
    expect(screen.queryByText(/personalised Telloya demonstration/)).not.toBeInTheDocument()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>
    expect(body.product).toBe("telloya")
    expect(body.planTier).toBeUndefined()
    expect(body.guardInterested).toBe(false)
    expect(body.guardLocationCount).toBeUndefined()
    expect(body.customMonthlyMinutes).toBeUndefined()
    expect(body.overageInterested).toBe(false)
    expect(body.overageMonthlyCapGbp).toBeUndefined()
    expect(body.businessName).toBe("Harbour Plumbing")
    expect(body.privacyAccepted).toBe(true)
    expect(body.receptionistQuestions).toBeUndefined()
    expect(body.requestIntent).toBeUndefined()
    const validated = validateTelloyaEnquiry(body)
    expect(validated.valid).toBe(true)
    if (validated.valid) {
      expect(validated.data.planTier).toBeUndefined()
      expect(validated.data.product).toBe("telloya")
      expect(validated.data.guardInterested).toBe(false)
      expect(validated.data.overageInterested).toBe(false)
    }
  })

  it("sends optional receptionist questions for every pathway and rejects an oversized answer", async () => {
    const question = "Ask whether the heating is on and the best time to call back."
    for (const tier of ["", "basic", "growth", "pro", "custom"] as const) {
      cleanup()
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          enquiryRef: reference,
          leadConversion: false,
          receiptEmailStatus: "sent",
        }),
      })
      vi.stubGlobal("fetch", fetchMock)
      renderEnabled(tier)
      if (tier === "custom") {
        fireEvent.change(screen.getByRole("spinbutton", { name: /Monthly minutes needed/ }), { target: { value: "1000" } })
        fireEvent.change(screen.getByRole("spinbutton", { name: /Phone numbers needed/ }), { target: { value: "2" } })
        fireEvent.change(screen.getByRole("spinbutton", { name: /Number of locations/ }), { target: { value: "4" } })
      }
      fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
      const field = screen.getByRole("textbox", { name: /What would you like your receptionist to ask/ }) as HTMLTextAreaElement
      expect(field).not.toBeRequired()
      expect(screen.getByText(/what you would like your receptionist to say/)).toBeInTheDocument()
      fireEvent.change(field, { target: { value: `  ${question}  ` } })
      fillContact()
      fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
      await screen.findByText("Our team will review your enquiry and get in touch using the details you provided.")
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>
      expect(body.receptionistQuestions).toBe(question)
      expect(body.requestIntent).toBeUndefined()
      expect(body.planTier).toBe(tier || undefined)
      const validated = validateTelloyaEnquiry(body)
      expect(validated.valid).toBe(true)
    }

    cleanup()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.change(screen.getByRole("textbox", { name: /What would you like your receptionist to ask/ }), {
      target: { value: "q".repeat(2001) },
    })
    fillContact()
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Please keep this within 2,000 characters.")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/Thank you for your enquiry/)).not.toBeInTheDocument()
  })

  it("keeps a personalised-demo request through both pathways and uses the demonstration acknowledgement", async () => {
    for (const tier of ["", "pro"] as const) {
      cleanup()
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          enquiryRef: reference,
          leadConversion: false,
          receiptEmailStatus: "sent",
        }),
      })
      vi.stubGlobal("fetch", fetchMock)
      renderEnabled(tier, false, "personalised-demo")
      expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument()
      expect(screen.queryByRole("radio", { name: /Help me choose a plan/ })).not.toBeInTheDocument()
      expect(screen.getByRole("note")).toHaveTextContent("Requesting a demonstration does not confirm an appointment.")
      expect(screen.getByRole("combobox", { name: /Plan preference/ })).toHaveValue(tier)
      fireEvent.change(screen.getByRole("textbox", { name: /What would you like your receptionist to ask/ }), {
        target: { value: "Ask for the postcode." },
      })
      fillContact()
      fireEvent.click(screen.getByRole("button", { name: "Request demonstration" }))
      expect(await screen.findByText(/We'll review what you would like your receptionist to say, then contact you with a suitable time and our demonstration number/)).toBeInTheDocument()
      expect(screen.queryByText("Requesting a demonstration does not confirm an appointment.")).not.toBeInTheDocument()
      expect(screen.getByText(reference)).toBeInTheDocument()
      expect(screen.getByText(/does not confirm the message has arrived in your inbox/)).toBeInTheDocument()
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>
      expect(body.requestIntent).toBe("personalised-demo")
      expect(body.receptionistQuestions).toBe("Ask for the postcode.")
      expect(body.planTier).toBe(tier || undefined)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })
})

describe("Telloya enquiry text entry", () => {
  afterEach(() => {
    cleanup()
  })

  it("keeps focus and the typed value on each character", () => {
    renderEnabled("basic")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const field = screen.getByRole("textbox", { name: /Business name/ })
    field.focus()
    let typed = ""
    for (const character of "Harbour Plumbing") {
      typed += character
      fireEvent.change(field, { target: { value: typed } })
      expect(document.activeElement).toBe(field)
      expect(field).toHaveValue(typed)
    }
  })

  it("accepts UK, United Kingdom and GB as the United Kingdom", () => {
    renderEnabled("")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    const country = screen.getByRole("combobox", { name: /^Country/ })
    for (const typed of ["UK", "United Kingdom", "GB"]) {
      fireEvent.change(country, { target: { value: typed } })
      fireEvent.keyDown(country, { key: "Enter" })
      expect(country).toHaveValue("United Kingdom")
      fireEvent.click(screen.getByRole("button", { name: "Clear country" }))
      expect(country).toHaveValue("")
    }
  })

  it("lets another business type be typed and keeps it when moving back", () => {
    renderEnabled("growth")
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    fireEvent.change(screen.getByRole("combobox", { name: /Business type or trade/ }), { target: { value: "other" } })
    const other = screen.getByRole("textbox", { name: /Please specify your business type/ })
    other.focus()
    fireEvent.change(other, { target: { value: "Pest control" } })
    expect(document.activeElement).toBe(other)
    expect(other).toHaveValue("Pest control")
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }))
    expect(screen.getByRole("combobox", { name: /Business type or trade/ })).toHaveValue("other")
    expect(screen.getByRole("textbox", { name: /Please specify your business type/ })).toHaveValue("Pest control")
  })

  it("lets a personalised demo be typed without choosing a plan", () => {
    renderEnabled("", false, "personalised-demo")
    const name = screen.getByRole("textbox", { name: /Business name/ })
    name.focus()
    fireEvent.change(name, { target: { value: "A" } })
    expect(document.activeElement).toBe(name)
    expect(name).toHaveValue("A")
    expect(screen.queryByRole("radio", { name: /^Basic/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("keeps fields editable after validation errors", () => {
    renderEnabled("", false, "personalised-demo")
    fireEvent.click(screen.getByRole("button", { name: "Request demonstration" }))
    const name = screen.getByRole("textbox", { name: /Business name/ })
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your business name.")
    name.focus()
    fireEvent.change(name, { target: { value: "Edited after the error" } })
    expect(name).toHaveValue("Edited after the error")
    expect(document.activeElement).toBe(name)
  })
})
