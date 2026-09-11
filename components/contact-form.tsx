"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import {
  CONTACT_SUBJECTS,
  enquiryLimits,
  validateEnquiry,
  type EnquiryField,
  type EnquiryFieldErrors,
} from "@/lib/enquiry"
import { HoneypotField } from "@/components/honeypot-field"
import styles from "./contact-form.module.css"

const SEND_ERROR = "We couldn't send your message right now. Your information is still on this page. Please try again shortly."
const MESSAGE_HINT = "Please don't include passwords, verification codes or account credentials."

export function ContactForm() {
  const formId = useId()
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const [errors, setErrors] = useState<EnquiryFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [simulated, setSimulated] = useState(false)
  const [statusText, setStatusText] = useState("")

  useEffect(() => {
    if (status === "success") successRef.current?.focus()
  }, [status])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const entries = Object.fromEntries(new FormData(form))
    const body = { ...entries, source: "contact" }
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
    setStatusText("Sending your message.")

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { ok?: boolean; simulated?: boolean; errors?: EnquiryFieldErrors }

      if (json.ok) {
        setSimulated(json.simulated === true)
        setStatus("success")
        setStatusText(json.simulated ? "Development simulation complete." : "Your message has been received.")
        return
      }

      if (json.errors && Object.keys(json.errors).length) {
        setErrors(json.errors)
      }

      setStatus("idle")
      setDeliveryError(true)
      setStatusText(SEND_ERROR)
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
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>This is not a live message.</h2>
            <p>The form worked, but nothing was delivered to a production inbox or CRM. In production, this confirmation will only appear after the message has actually been sent.</p>
          </>
        ) : (
          <>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>Thank you. We&apos;ve received your message.</h2>
            <p>We&apos;ll review your message and use the email address you provided to reply or point you to the right route.</p>
            <p>If your message is about an active Business Profile or review issue, we may direct you to Get Help so the relevant case information can be collected properly.</p>
          </>
        )}
      </div>
    )
  }

  const errorEntries = Object.entries(errors).filter(([field]) => field === "fullName" || field === "email" || field === "businessName" || field === "subject" || field === "details") as [EnquiryField, string][]
  const showSummary = errorEntries.length > 0 || deliveryError
  const detailsDescribedBy = [
    `${formId}-details-hint`,
    errors.details ? `${formId}-details-error` : null,
  ].filter(Boolean).join(" ")

  return (
    <form className={styles.form} onSubmit={submit} noValidate aria-busy={status === "loading"}>
      <div>
        <p className={styles.formEyebrow}>General enquiry</p>
        <h2 className={styles.formTitle}>Send us a message</h2>
        <p className={styles.formLead}>We only need enough information to understand your question.</p>
      </div>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary}>
          {deliveryError ? <p>{SEND_ERROR}</p> : null}
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
          <label htmlFor={`${formId}-subject`}>Subject</label>
          <select
            id={`${formId}-subject`}
            name="subject"
            required
            className={styles.control}
            aria-invalid={Boolean(errors.subject) || undefined}
            aria-describedby={errors.subject ? `${formId}-subject-error` : undefined}
            onChange={() => clearField("subject")}
            defaultValue=""
          >
            <option value="">Select one</option>
            {CONTACT_SUBJECTS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {errors.subject ? <p id={`${formId}-subject-error`} className={styles.error}>{errors.subject}</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-details`}>Message</label>
          <textarea
            id={`${formId}-details`}
            name="details"
            required
            rows={7}
            maxLength={enquiryLimits.details}
            className={styles.control}
            placeholder="Tell us what you'd like to ask."
            aria-invalid={Boolean(errors.details) || undefined}
            aria-describedby={detailsDescribedBy}
            onChange={() => clearField("details")}
          />
          <p id={`${formId}-details-hint`} className={styles.hint}>{MESSAGE_HINT}</p>
          {errors.details ? <p id={`${formId}-details-error`} className={styles.error}>{errors.details}</p> : null}
        </div>
      </div>

      <HoneypotField />

      <button type="submit" className={styles.submit} disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : "Send my message"}
      </button>

      <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
    </form>
  )
}
