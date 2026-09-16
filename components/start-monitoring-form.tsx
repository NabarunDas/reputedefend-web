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
import lockStyles from "./start-monitoring-form.module.css"

export const SUCCESS_COPY = {
  title: "Monitoring setup request received.",
  recorded: (businessName: string) => `We've received the details for ${businessName}.`,
  notActive: "Monitoring is not active yet.",
  next: "We'll review the setup information and contact you with the next step before monitoring begins.",
  emailSent: "We've also sent a confirmation to your email address.",
  emailFailed: "We couldn't send the confirmation email right now, but your setup request has been safely recorded.",
} as const

export const RETRY_COPY = "We couldn't confirm whether your request was received. Try again using the same details so we can check without creating another setup request."
export const RATE_LIMIT_COPY = "Please wait a moment and try again."
export const KEY_ERROR = "We couldn't start your setup request. Your information is still on this page. Please try again."
export const CORRECT_DETAILS_LABEL = "Need to correct these details?"

const MONITORING_FIELDS: readonly MonitoringField[] = [
  "fullName",
  "email",
  "phone",
  "businessName",
  "country",
  "websiteUrl",
  "businessProfileUrl",
  "numberOfLocations",
  "termsAccepted",
]

const KNOWN_FIELD_SET = new Set<string>(MONITORING_FIELDS)

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

type CapturedPayload = MonitoringIntakeInput & {
  source: "start-monitoring"
  companyFax: string
}

type SubmissionAttempt = {
  payload: CapturedPayload
  submissionKey: string
  uncertain: boolean
}

type FormPhase = "edit" | "sending" | "retry" | "success"

function readStructuredFieldErrors(value: unknown): MonitoringFieldErrors | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null
  const errors: MonitoringFieldErrors = {}
  for (const [key, message] of Object.entries(value as Record<string, unknown>)) {
    if (!KNOWN_FIELD_SET.has(key) || typeof message !== "string" || !message.trim()) continue
    errors[key as MonitoringField] = message
  }
  return Object.keys(errors).length ? errors : null
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function isPersistedSuccess(httpOk: boolean, body: unknown): body is {
  ok: true
  persisted: true
  receiptEmailSent?: boolean
} {
  if (!httpOk || body == null || typeof body !== "object" || Array.isArray(body)) return false
  const value = body as Record<string, unknown>
  return value.ok === true && value.persisted === true
}

export function StartMonitoringForm() {
  const [values, setValues] = useState<MonitoringIntakeInput>(INITIAL_VALUES)
  const [locationsText, setLocationsText] = useState("1")
  const [errors, setErrors] = useState<MonitoringFieldErrors>({})
  const [phase, setPhase] = useState<FormPhase>("edit")
  const [capturedPayload, setCapturedPayload] = useState<CapturedPayload | null>(null)
  const [receiptEmailSent, setReceiptEmailSent] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [summaryMessage, setSummaryMessage] = useState("")
  const [rateLimited, setRateLimited] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const attemptRef = useRef<SubmissionAttempt | null>(null)
  const inFlightRef = useRef(false)
  const lockedRef = useRef(false)
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

  function displayedValues() {
    return capturedPayload && (phase === "sending" || phase === "retry") ? capturedPayload : values
  }

  function update<K extends keyof MonitoringIntakeInput>(key: K, value: MonitoringIntakeInput[K]) {
    if (lockedRef.current) return
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

  function enterRetry(message: string, waitBriefly = false) {
    const attempt = attemptRef.current
    if (attempt) attempt.uncertain = true
    lockedRef.current = true
    setRateLimited(waitBriefly)
    setSummaryMessage(message)
    setErrors({})
    setPhase("retry")
    setStatusText(message)
    requestFocus("summary")
  }

  function discardAttempt() {
    attemptRef.current = null
    lockedRef.current = false
    setCapturedPayload(null)
    setRateLimited(false)
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlightRef.current) return
    inFlightRef.current = true

    const existing = attemptRef.current
    if (existing?.uncertain) {
      lockedRef.current = true
    } else {
      const companyFax = new FormData(event.currentTarget).get("companyFax")
      const localErrors = collectMonitoringErrors(values)
      if (Object.keys(localErrors).length) {
        inFlightRef.current = false
        lockedRef.current = false
        setErrors(localErrors)
        setSummaryMessage("")
        setRateLimited(false)
        setStatusText("Please correct the highlighted fields before submitting.")
        requestFocus("summary")
        return
      }

      lockedRef.current = true
      const payload: CapturedPayload = Object.freeze({
        ...values,
        source: "start-monitoring",
        companyFax: typeof companyFax === "string" ? companyFax : "",
      })

      try {
        const submissionKey = window.crypto.randomUUID()
        if (!submissionKey) throw new Error("missing-submission-key")
        attemptRef.current = { payload, submissionKey, uncertain: false }
        setCapturedPayload(payload)
      } catch {
        inFlightRef.current = false
        lockedRef.current = false
        attemptRef.current = null
        setCapturedPayload(null)
        setSummaryMessage(KEY_ERROR)
        setErrors({})
        setPhase("edit")
        setStatusText(KEY_ERROR)
        requestFocus("summary")
        return
      }
    }

    const attempt = attemptRef.current
    if (!attempt) {
      inFlightRef.current = false
      lockedRef.current = false
      return
    }

    setErrors({})
    setSummaryMessage("")
    setRateLimited(false)
    setPhase("sending")
    setStatusText("Sending your setup request.")

    try {
      const response = await fetch("/api/monitoring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...attempt.payload, submissionKey: attempt.submissionKey }),
      })
      const body = await readResponseBody(response)

      if (isPersistedSuccess(response.ok, body)) {
        setReceiptEmailSent(body.receiptEmailSent === true)
        setPhase("success")
        setStatusText("Your setup request has been received.")
        requestFocus("success")
        return
      }

      if (!attempt.uncertain && response.status === 400) {
        const fieldErrors = readStructuredFieldErrors(
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as Record<string, unknown>).errors
            : undefined,
        )
        if (fieldErrors) {
          discardAttempt()
          setErrors(fieldErrors)
          setSummaryMessage("")
          setPhase("edit")
          setStatusText("Please correct the highlighted fields before submitting.")
          requestFocus("summary")
          return
        }
      }

      if (response.status === 429) {
        enterRetry(`${RETRY_COPY} ${RATE_LIMIT_COPY}`, true)
        return
      }

      enterRetry(RETRY_COPY)
    } catch {
      enterRetry(RETRY_COPY)
    } finally {
      inFlightRef.current = false
    }
  }

  if (phase === "success") {
    const businessName = capturedPayload?.businessName ?? values.businessName
    return (
      <div className={styles.success} role="status">
        <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>{SUCCESS_COPY.title}</h2>
        <p>{SUCCESS_COPY.recorded(businessName)}</p>
        <p className={styles.caseRefLabel}>{SUCCESS_COPY.notActive}</p>
        <p>{SUCCESS_COPY.next}</p>
        <p>{receiptEmailSent ? SUCCESS_COPY.emailSent : SUCCESS_COPY.emailFailed}</p>
      </div>
    )
  }

  const locked = phase === "sending" || phase === "retry"
  const shown = displayedValues()
  const errorEntries = Object.entries(errors) as [MonitoringField, string][]
  const showSummary = errorEntries.length > 0 || phase === "retry" || Boolean(summaryMessage)
  const sending = phase === "sending"

  return (
    <form className={styles.form} onSubmit={submitRequest} noValidate aria-busy={sending}>
      <div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>Tell us which profile to monitor</h2>
        <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
      </div>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary} id={`${formId}-summary`}>
          {phase === "retry" ? (
            <>
              <p>{RETRY_COPY}</p>
              {rateLimited ? <p>{RATE_LIMIT_COPY}</p> : null}
              <p>
                <Link className={lockStyles.correctLink} href="/contact">{CORRECT_DETAILS_LABEL}</Link>
              </p>
            </>
          ) : summaryMessage ? <p>{summaryMessage}</p> : null}
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
          <Field id={`${formId}-fullName`} label="Full name" error={errors.fullName} locked={locked}>
            <input name="fullName" value={shown.fullName} onChange={(event) => update("fullName", event.target.value)} maxLength={monitoringLimits.fullName} autoComplete="name" autoCapitalize="words" required />
          </Field>
          <div className={styles.twoCol}>
            <Field id={`${formId}-email`} label="Email" error={errors.email} locked={locked}>
              <input name="email" type="email" value={shown.email} onChange={(event) => update("email", event.target.value)} maxLength={monitoringLimits.email} autoComplete="email" inputMode="email" required />
            </Field>
            <Field id={`${formId}-phone`} label="Phone number" optional error={errors.phone} locked={locked}>
              <input name="phone" type="tel" value={shown.phone} onChange={(event) => update("phone", event.target.value)} maxLength={monitoringLimits.phone} autoComplete="tel" inputMode="tel" />
            </Field>
          </div>
        </div>

        <div className={styles.group}>
          <p className={styles.groupTitle}>Business to monitor</p>
          <Field id={`${formId}-businessName`} label="Business name" error={errors.businessName} locked={locked}>
            <input name="businessName" value={shown.businessName} onChange={(event) => update("businessName", event.target.value)} maxLength={monitoringLimits.businessName} autoComplete="organization" required />
          </Field>
          <Field id={`${formId}-country`} label="Country" error={errors.country} locked={locked}>
            <input name="country" value={shown.country} onChange={(event) => update("country", event.target.value)} maxLength={monitoringLimits.country} autoComplete="country-name" required />
          </Field>
          <Field id={`${formId}-websiteUrl`} label="Website URL" optional error={errors.websiteUrl} locked={locked}>
            <input name="websiteUrl" type="url" value={shown.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} maxLength={monitoringLimits.websiteUrl} autoComplete="url" inputMode="url" />
          </Field>
          <Field
            id={`${formId}-businessProfileUrl`}
            label="Google Business Profile URL"
            hint="Paste the public Google Maps or Business Profile link for the main location you want us to monitor."
            error={errors.businessProfileUrl}
            locked={locked}
          >
            <input name="businessProfileUrl" type="url" value={shown.businessProfileUrl} onChange={(event) => update("businessProfileUrl", event.target.value)} maxLength={monitoringLimits.businessProfileUrl} inputMode="url" required />
          </Field>
          <Field
            id={`${formId}-numberOfLocations`}
            label="Number of locations to monitor"
            hint="Tell us how many business locations you want included in your Relaunch Guard setup."
            error={errors.numberOfLocations}
            locked={locked}
          >
            <input
              name="numberOfLocations"
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              step={1}
              value={locked ? String(shown.numberOfLocations) : locationsText}
              onChange={(event) => {
                if (lockedRef.current) return
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
          className={locked ? lockStyles.lockedCheck : undefined}
          checked={shown.termsAccepted}
          disabled={locked}
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
        <button className={styles.next} type="submit" disabled={sending}>
          {sending ? "Sending setup request" : phase === "retry" ? "Try again" : "Submit setup request"}
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
  locked,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  locked?: boolean
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
        className: [styles.control, locked ? lockStyles.lockedControl : "", children.props.className].filter(Boolean).join(" "),
        readOnly: locked || children.props.readOnly,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
    </div>
  )
}
