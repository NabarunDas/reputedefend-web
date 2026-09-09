"use client"

import { useState, type FormEvent } from "react"
import { GENERAL_SERVICE_OPTIONS, enquiryLimits } from "@/lib/enquiry"
import { HoneypotField } from "@/components/honeypot-field"

type EnquiryFormProps = {
  source?: "homepage" | "contact"
  caseMode?: boolean
}

export function EnquiryForm({ source = "contact", caseMode = false }: EnquiryFormProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState("loading")
    const form = new FormData(event.currentTarget)
    const res = await fetch("/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...Object.fromEntries(form), source }),
    })
    const json = await res.json() as { ok?: boolean; message?: string }
    setMessage(json.message ?? "")
    setState(json.ok ? "success" : "error")
  }

  const fieldClass = "rounded-xl border border-[var(--line)] px-4 py-3 font-normal"

  return (
    <form onSubmit={submit} className="relative flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-[0_18px_60px_rgba(16,38,31,.08)] md:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Name
          <input name="fullName" required maxLength={enquiryLimits.fullName} autoComplete="name" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Email
          <input name="email" type="email" required maxLength={enquiryLimits.email} autoComplete="email" className={fieldClass} />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        Business name <span className="font-normal text-[var(--muted)]">(optional)</span>
        <input name="businessName" maxLength={enquiryLimits.businessName} autoComplete="organization" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        What do you need help with?
        <select name="service" required className={`bg-white ${fieldClass}`}>
          <option value="">Select one</option>
          {GENERAL_SERVICE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-semibold">
        {caseMode ? "Tell us what happened" : "How can we help?"}
        <textarea
          name="details"
          required
          maxLength={enquiryLimits.details}
          rows={6}
          className={`resize-y ${fieldClass}`}
          placeholder={caseMode ? "Include dates, messages or changes you have noticed." : "Share a little context and the best next step for you."}
        />
      </label>
      <HoneypotField />
      <button disabled={state === "loading"} className="rounded-full bg-[var(--green)] px-6 py-3.5 font-bold text-white disabled:opacity-60">
        {state === "loading" ? "Sending…" : caseMode ? "Submit case details" : "Send enquiry"}
      </button>
      <p aria-live="polite" className={state === "error" ? "text-sm text-red-700" : "text-sm text-[var(--muted)]"}>{message}</p>
    </form>
  )
}
