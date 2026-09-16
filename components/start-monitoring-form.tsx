"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactElement } from "react"
import { HoneypotField } from "@/components/honeypot-field"
import {
  collectMonitoringErrors,
  monitoringLimits,
  type MonitoringField,
  type MonitoringFieldErrors,
} from "@/lib/monitoring/validation"
import type { MonitoringIntakeInput } from "@/lib/monitoring/snapshot"
import styles from "./case-intake.module.css"

export const SUCCESS_COPY = {
  title: "Monitoring setup request received.",
  recorded: (businessName: string) => `We've received the details for ${businessName}.`,
  notActive: "Monitoring is not active yet.",
  next: "We'll review the setup information and contact you with the next step before monitoring begins.",
  emailSent: "We've also sent a confirmation to your email address.",
  emailFailed: "We couldn't send the confirmation email right now, but your setup request has been safely recorded.",
} as const

const SUBMIT_ERROR = "We couldn't submit your setup request right now. Your information is still on this page. Please try again shortly."

const INITIAL_VALUES: MonitoringIntakeInput = {
  fullName: "",
  email: "",
  phone: "",
  businessName: "",
  country: "",
  websiteUrl: "",
  businessProfileUrl: "",
  numberOfLocations: 1,
  termsAccepted: false,
}

export function StartMonitoringForm() {
  const [values, setValues] = useState<MonitoringIntakeInput>(INITIAL_VALUES)
  const [locationsText, setLocationsText] = useState("1")
  const [errors, setErrors] = useState<MonitoringFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [receiptEmailSent, setReceiptEmailSent] = useState(false)
  const [statusText, setStatusText] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const submissionKeyRef = useRef("")
  const formId = useId()
  const focusWhat = useRef<"heading" | "summary" | "success">("heading")
  const [focusKey, setFocusKey] = useState(0)

  useEffect(() => {
    if (focusKey === 0) return
    if (focusWhat.current === "success") successRef.current?.focus()
    else if (focusWhat.current === "summary") summaryRef.current?.focus()
    else headingRef.current?.focus()
  }, [focusKey])

  function requestFocus(target: "heading" | "summary" | "success") {
    focusWhat.current = target
    setFocusKey((key) => key + 1)
  }

  function update<K extends keyof MonitoringIntakeInput>(key: K, value: MonitoringIntakeInput[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function goToField(field: MonitoringField) {
    requestFocus("summary")
    window.setTimeout(() => document.getElementById(`${formId}-${field}`)?.focus(), 0)
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const companyFax = new FormData(event.currentTarget).get("companyFax")
    const body = {
      ...values,
      source: "start-monitoring",
      companyFax: typeof companyFax === "string" ? companyFax : "",
    }
    const localErrors = collectMonitoringErrors(values)
    if (Object.keys(localErrors).length) {
      setErrors(localErrors)
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before submitting.")
      requestFocus("summary")
      return
    }

    setStatus("loading")
    setDeliveryError(false)
    setStatusText("Sending your setup request.")

    if (!submissionKeyRef.current) {
      submissionKeyRef.current = window.crypto.randomUUID()
    }

    try {
      const res = await fetch("/api/monitoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, submissionKey: submissionKeyRef.current }),
      })
      const json = await res.json() as {
        ok?: boolean
        persisted?: boolean
        receiptEmailSent?: boolean
        errors?: MonitoringFieldErrors
      }

      if (json.ok && json.persisted) {
        setReceiptEmailSent(json.receiptEmailSent === true)
        setStatus("success")
        setStatusText("Your setup request has been received.")
        requestFocus("success")
        return
      }

      if (json.errors && Object.keys(json.errors).length) {
        setErrors(json.errors)
      }

      setStatus("idle")
      setDeliveryError(true)
      setStatusText(SUBMIT_ERROR)
      requestFocus("summary")
    } catch {
      setStatus("idle")
      setDeliveryError(true)
      setStatusText(SUBMIT_ERROR)
      requestFocus("summary")
    }
  }

  if (status === "success") {
    return (
      <div className={styles.success} role="status">
        <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>{SUCCESS_COPY.title}</h2>
        <p>{SUCCESS_COPY.recorded(values.businessName)}</p>
        <p className={styles.caseRefLabel}>{SUCCESS_COPY.notActive}</p>
        <p>{SUCCESS_COPY.next}</p>
        <p>{receiptEmailSent ? SUCCESS_COPY.emailSent : SUCCESS_COPY.emailFailed}</p>
      </div>
    )
  }

  const errorEntries = Object.entries(errors) as [MonitoringField, string][]
  const showSummary = errorEntries.length > 0 || deliveryError

  return (
    <form className={styles.form} onSubmit={submitRequest} noValidate aria-busy={status === "loading"}>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>Tell us which profile to monitor</h2>
        <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
      </div>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary} id={`${formId}-summary`}>
          {deliveryError ? <p>{SUBMIT_ERROR}</p> : null}
          {errorEntries.length > 0 && (
            <>
              <p>Please correct the following:</p>
              <ul>
                {errorEntries.map(([field, message]) => (
                  <li key={field}>
                    <a href={`#${formId}-${field}`} onClick={(event) => { event.preventDefault(); goToField(field) }}>{message}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className={styles.fields}>
        <div className={styles.group}>
          <p className={styles.groupTitle}>Your details</p>
          <Field id={`${formId}-fullName`} label="Full name" error={errors.fullName}>
            <input name="fullName" value={values.fullName} onChange={(event) => update("fullName", event.target.value)} maxLength={monitoringLimits.fullName} autoComplete="name" autoCapitalize="words" required />
          </Field>
          <div className={styles.twoCol}>
            <Field id={`${formId}-email`} label="Email" error={errors.email}>
              <input name="email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} maxLength={monitoringLimits.email} autoComplete="email" inputMode="email" required />
            </Field>
            <Field id={`${formId}-phone`} label="Phone number" optional error={errors.phone}>
              <input name="phone" type="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} maxLength={monitoringLimits.phone} autoComplete="tel" inputMode="tel" />
            </Field>
          </div>
        </div>

        <div className={styles.group}>
          <p className={styles.groupTitle}>Business to monitor</p>
          <Field id={`${formId}-businessName`} label="Business name" error={errors.businessName}>
            <input name="businessName" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} maxLength={monitoringLimits.businessName} autoComplete="organization" required />
          </Field>
          <Field id={`${formId}-country`} label="Country" error={errors.country}>
            <input name="country" value={values.country} onChange={(event) => update("country", event.target.value)} maxLength={monitoringLimits.country} autoComplete="country-name" required />
          </Field>
          <Field id={`${formId}-websiteUrl`} label="Website URL" optional error={errors.websiteUrl}>
            <input name="websiteUrl" type="url" value={values.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} maxLength={monitoringLimits.websiteUrl} autoComplete="url" inputMode="url" />
          </Field>
          <Field
            id={`${formId}-businessProfileUrl`}
            label="Google Business Profile URL"
            hint="Paste the public Google Maps or Business Profile link for the main location you want us to monitor."
            error={errors.businessProfileUrl}
          >
            <input name="businessProfileUrl" type="url" value={values.businessProfileUrl} onChange={(event) => update("businessProfileUrl", event.target.value)} maxLength={monitoringLimits.businessProfileUrl} inputMode="url" required />
          </Field>
          <Field
            id={`${formId}-numberOfLocations`}
            label="Number of locations to monitor"
            hint="Tell us how many business locations you want included in your Relaunch Guard setup."
            error={errors.numberOfLocations}
          >
            <input
              name="numberOfLocations"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              step={1}
              value={locationsText}
              onChange={(event) => {
                const next = event.target.value
                setLocationsText(next)
                const parsed = Number(next)
                update("numberOfLocations", Number.isInteger(parsed) ? parsed : Number.NaN)
              }}
              required
            />
          </Field>
        </div>
      </div>

      <label className={styles.check} htmlFor={`${formId}-termsAccepted`}>
        <input
          id={`${formId}-termsAccepted`}
          name="termsAccepted"
          type="checkbox"
          checked={values.termsAccepted}
          onChange={(event) => update("termsAccepted", event.target.checked)}
          aria-invalid={Boolean(errors.termsAccepted) || undefined}
          aria-describedby={errors.termsAccepted ? `${formId}-termsAccepted-error` : undefined}
        />
        <span>
          I confirm that I am authorised to request Relaunch Guard setup for this business and that the information provided is accurate.
          {" "}
          See our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
        </span>
      </label>
      {errors.termsAccepted ? <p id={`${formId}-termsAccepted-error`} className={styles.error}>{errors.termsAccepted}</p> : null}

      <HoneypotField />

      <div className={styles.actions}>
        <button className={styles.next} type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Sending setup request" : "Submit setup request"}
        </button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  children: ReactElement<InputHTMLAttributes<HTMLInputElement>>
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {label}
        {optional ? <span>Optional</span> : null}
      </label>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      {cloneElement(children, {
        id,
        className: styles.control,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
    </div>
  )
}
