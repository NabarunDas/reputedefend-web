"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import {
  GENERAL_SERVICE_OPTIONS,
  enquiryLimits,
  validateEnquiry,
  type EnquiryField,
  type EnquiryFieldErrors,
} from "@/lib/enquiry"
import { HoneypotField } from "@/components/honeypot-field"
import styles from "./enquiry-form.module.css"

const SEND_ERROR = "We couldn't send this enquiry right now. Your information is still on this page. Please try again shortly."

type EnquiryFormProps = {
  source?: "homepage" | "contact"
  caseMode?: boolean
  submitLabel?: string
}

export function EnquiryForm({ source = "homepage", caseMode = false, submitLabel }: EnquiryFormProps) {
  const buttonLabel = submitLabel ?? (caseMode ? "Get help with a case" : "Send enquiry")
  const formId = useId()
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const [errors, setErrors] = useState<EnquiryFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [simulated, setSimulated] = useState(false)
  const [statusText, setStatusText] = useState("")

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const body = { ...Object.fromEntries(new FormData(form)), source }
    const checked = validateEnquiry(body)

    if (!checked.valid) {
      setErrors(checked.errors ?? {})
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before sending.")
      window.setTimeout(() => summaryRef.current?.focus(), 0)
      return
    }

    setStatus("loading")
    setDeliveryError(false)
    setErrors({})
    setStatusText("Sending your enquiry.")

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { ok?: boolean; simulated?: boolean; errors?: EnquiryFieldErrors; message?: string }

      if (json.ok) {
        setSimulated(json.simulated === true)
        setStatus("success")
        setStatusText(json.simulated ? "Development simulation complete." : "Your enquiry has been received.")
        window.setTimeout(() => successRef.current?.focus(), 0)
        return
      }

      if (json.errors && Object.keys(json.errors).length) {
        setErrors(json.errors)
      }

      setStatus("idle")
      setDeliveryError(true)
      setStatusText(json.message ?? SEND_ERROR)
      window.setTimeout(() => summaryRef.current?.focus(), 0)
    } catch {
      setStatus("idle")
      setDeliveryError(true)
      setStatusText(SEND_ERROR)
      window.setTimeout(() => summaryRef.current?.focus(), 0)
    }
  }

  function clearField(field: EnquiryField) {
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  if (status === "success") {
    return (
      <div className={styles.success} role="status">
        {simulated ? (
          <>
            <p className={styles.simulated}>Development simulation</p>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>This is not a live enquiry.</h2>
            <p>The form worked, but nothing was delivered to a production inbox or CRM. In production, this confirmation will only appear after the enquiry has actually been sent.</p>
          </>
        ) : (
          <>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>Thank you. We’ve received your enquiry.</h2>
            <p>We’ll review what you sent and come back with a practical view of the next step.</p>
          </>
        )}
      </div>
    )
  }

  const errorEntries = Object.entries(errors).filter(([field]) => (
    field === "fullName" || field === "email" || field === "businessName" || field === "service" || field === "details"
  )) as [EnquiryField, string][]
  const showSummary = errorEntries.length > 0 || deliveryError

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={status === "loading"}>
      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary}>
          {deliveryError ? <p>{statusText || SEND_ERROR}</p> : null}
          {errorEntries.length > 0 && (
            <>
              <p>Please correct the following:</p>
              <ul>
                {errorEntries.map(([field, message]) => (
                  <li key={field}>
                    <a href={`#${formId}-${field}`}>{message}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className={styles.fields}>
        <div className={styles.twoCol}>
          <div className={styles.field}>
            <label htmlFor={`${formId}-fullName`}>Name</label>
            <input
              id={`${formId}-fullName`}
              name="fullName"
              autoComplete="name"
              maxLength={enquiryLimits.fullName}
              required
              className={styles.control}
              aria-invalid={Boolean(errors.fullName) || undefined}
              aria-describedby={errors.fullName ? `${formId}-fullName-error` : undefined}
              onChange={() => clearField("fullName")}
            />
            {errors.fullName ? <p id={`${formId}-fullName-error`} className={styles.error}>{errors.fullName}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${formId}-email`}>Email</label>
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={enquiryLimits.email}
              required
              className={styles.control}
              aria-invalid={Boolean(errors.email) || undefined}
              aria-describedby={errors.email ? `${formId}-email-error` : undefined}
              onChange={() => clearField("email")}
            />
            {errors.email ? <p id={`${formId}-email-error`} className={styles.error}>{errors.email}</p> : null}
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-businessName`}>Business name <span>Optional</span></label>
          <input
            id={`${formId}-businessName`}
            name="businessName"
            autoComplete="organization"
            maxLength={enquiryLimits.businessName}
            className={styles.control}
            aria-invalid={Boolean(errors.businessName) || undefined}
            aria-describedby={errors.businessName ? `${formId}-businessName-error` : undefined}
            onChange={() => clearField("businessName")}
          />
          {errors.businessName ? <p id={`${formId}-businessName-error`} className={styles.error}>{errors.businessName}</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-service`}>What do you need help with?</label>
          <select
            id={`${formId}-service`}
            name="service"
            required
            className={styles.control}
            defaultValue=""
            aria-invalid={Boolean(errors.service) || undefined}
            aria-describedby={errors.service ? `${formId}-service-error` : undefined}
            onChange={() => clearField("service")}
          >
            <option value="">Select one</option>
            {GENERAL_SERVICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {errors.service ? <p id={`${formId}-service-error`} className={styles.error}>{errors.service}</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-details`}>{caseMode ? "Tell us what happened" : "How can we help?"}</label>
          <textarea
            id={`${formId}-details`}
            name="details"
            required
            maxLength={enquiryLimits.details}
            rows={6}
            className={styles.control}
            placeholder={caseMode ? "Include dates, messages or changes you have noticed." : "Share a little context and the best next step for you."}
            aria-invalid={Boolean(errors.details) || undefined}
            aria-describedby={errors.details ? `${formId}-details-error` : undefined}
            onChange={() => clearField("details")}
          />
          {errors.details ? <p id={`${formId}-details-error`} className={styles.error}>{errors.details}</p> : null}
        </div>
      </div>

      <HoneypotField />

      <p className={styles.privacy}>Please do not include passwords, verification codes or account credentials.</p>

      <button type="submit" className={styles.submit} disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : buttonLabel}
      </button>

      <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
    </form>
  )
}
