"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from "react"
import { ArrowLeft, ArrowRight, Check } from "lucide-react"
import {
  CASE_SERVICES,
  caseServiceLabel,
  collectEnquiryErrors,
  enquiryLimits,
  getCaseIntakeStepErrors,
  showsBusinessProfileUrl,
  showsReviewUrl,
  type CaseService,
  type EnquiryField,
  type EnquiryFieldErrors,
  type EnquiryInput,
} from "@/lib/enquiry"
import { HoneypotField } from "@/components/honeypot-field"
import styles from "./case-intake.module.css"

const STEP_TITLES = {
  1: "What do you need help with?",
  2: "About you and your business",
  3: "About the issue",
  4: "Review & submit",
} as const

const SUBMIT_ERROR = "We couldn't submit your case right now. Your information is still on this page. Please try again shortly."

type IntakeValues = {
  service: CaseService | ""
  fullName: string
  email: string
  businessName: string
  country: string
  phone: string
  websiteUrl: string
  businessProfileUrl: string
  reviewUrl: string
  details: string
  informationAccurate: boolean
  privacyAccepted: boolean
}

const INITIAL_VALUES: IntakeValues = {
  service: "",
  fullName: "",
  email: "",
  businessName: "",
  country: "",
  phone: "",
  websiteUrl: "",
  businessProfileUrl: "",
  reviewUrl: "",
  details: "",
  informationAccurate: false,
  privacyAccepted: false,
}

const FIELD_STEPS: Record<EnquiryField, 1 | 2 | 3 | 4> = {
  service: 1,
  fullName: 2,
  email: 2,
  businessName: 2,
  country: 2,
  phone: 2,
  websiteUrl: 2,
  businessProfileUrl: 3,
  reviewUrl: 3,
  details: 3,
  informationAccurate: 4,
  privacyAccepted: 4,
  source: 1,
  subject: 1,
}

type CaseIntakeFormProps = {
  initialService?: CaseService | ""
}

export function CaseIntakeForm({ initialService = "" }: CaseIntakeFormProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [values, setValues] = useState<IntakeValues>({ ...INITIAL_VALUES, service: initialService })
  const [errors, setErrors] = useState<EnquiryFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [simulated, setSimulated] = useState(false)
  const [statusText, setStatusText] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  const focusWhat = useRef<"heading" | "summary" | "success" | "field">("heading")
  const [focusKey, setFocusKey] = useState(0)

  useEffect(() => {
    if (focusKey === 0) return
    if (focusWhat.current === "success") successRef.current?.focus()
    else if (focusWhat.current === "summary") summaryRef.current?.focus()
    else if (focusWhat.current === "heading") headingRef.current?.focus()
  }, [focusKey])

  function requestFocus(target: "heading" | "summary" | "success" | "field") {
    focusWhat.current = target
    setFocusKey((key) => key + 1)
  }

  function update<K extends keyof IntakeValues>(key: K, value: IntakeValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key as EnquiryField]) return current
      const next = { ...current }
      delete next[key as EnquiryField]
      return next
    })
  }

  function payload(): EnquiryInput {
    return {
      fullName: values.fullName,
      email: values.email,
      businessName: values.businessName,
      country: values.country,
      phone: values.phone,
      service: values.service as CaseService,
      websiteUrl: values.websiteUrl,
      businessProfileUrl: showsBusinessProfileUrl(values.service) ? values.businessProfileUrl : "",
      reviewUrl: showsReviewUrl(values.service) ? values.reviewUrl : "",
      details: values.details,
      informationAccurate: values.informationAccurate,
      privacyAccepted: values.privacyAccepted,
      source: "get-help",
      subject: "",
    }
  }

  function goToStep(next: 1 | 2 | 3 | 4) {
    setErrors({})
    setDeliveryError(false)
    setStatusText("")
    setStep(next)
    requestFocus("heading")
  }

  function goToField(field: EnquiryField) {
    const nextStep = FIELD_STEPS[field]
    if (nextStep !== step) setStep(nextStep)
    requestFocus("field")
    window.setTimeout(() => document.getElementById(`${formId}-${field}`)?.focus(), 0)
  }

  function continueToNext() {
    const stepErrors = getCaseIntakeStepErrors(step, payload())
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length) {
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before continuing.")
      requestFocus("summary")
      return
    }
    setStatus("idle")
    setDeliveryError(false)
    setStatusText("")
    setStep((current) => (current < 4 ? ((current + 1) as 2 | 3 | 4) : current))
    requestFocus("heading")
  }

  function goBack() {
    goToStep((step > 1 ? step - 1 : 1) as 1 | 2 | 3)
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < 4) {
      continueToNext()
      return
    }

    const companyFax = new FormData(event.currentTarget).get("companyFax")
    const body = { ...payload(), companyFax: typeof companyFax === "string" ? companyFax : "" }
    const localErrors = collectEnquiryErrors(body)
    if (Object.keys(localErrors).length) {
      setErrors(localErrors)
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before submitting.")
      const firstField = Object.keys(localErrors)[0] as EnquiryField
      if (FIELD_STEPS[firstField] !== 4) setStep(FIELD_STEPS[firstField])
      requestFocus("summary")
      return
    }

    setStatus("loading")
    setDeliveryError(false)
    setStatusText("Submitting your case.")

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
        setStatusText(json.simulated ? "Development simulation complete." : "Your case has been received.")
        requestFocus("success")
        return
      }

      if (json.errors && Object.keys(json.errors).length) {
        setErrors(json.errors)
        const firstField = Object.keys(json.errors)[0] as EnquiryField
        if (FIELD_STEPS[firstField] && FIELD_STEPS[firstField] !== step) setStep(FIELD_STEPS[firstField])
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
        {simulated ? (
          <>
            <p className={styles.simulated}>Development simulation</p>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>This is not a live case submission.</h2>
            <p>The form worked, but nothing was delivered to a production inbox or CRM. In production, this confirmation will only appear after the case has actually been sent.</p>
          </>
        ) : (
          <>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>Thank you. We’ve received your case.</h2>
            <p>The information you shared will be reviewed. ReputeDefend may contact you for additional context before recommending a next step.</p>
          </>
        )}
        <p className={styles.successNote}>Independent support. No guaranteed reinstatement or review removal.</p>
      </div>
    )
  }

  const errorEntries = Object.entries(errors) as [EnquiryField, string][]
  const showSummary = errorEntries.length > 0 || deliveryError

  return (
    <form className={styles.form} onSubmit={submitCase} noValidate aria-busy={status === "loading"}>
      <div className={styles.progress}>
        <p className={styles.progressLabel} id={`${formId}-progress`}>Step {step} of 4</p>
        <div className={styles.progressTrack} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-labelledby={`${formId}-progress`}>
          <span style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>{STEP_TITLES[step]}</h2>
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

      <div key={step} className={styles.panel}>
        {step === 1 && (
          <fieldset className={styles.options} aria-invalid={Boolean(errors.service) || undefined} aria-describedby={errors.service ? `${formId}-service-error` : undefined}>
            <legend className={styles.visuallyHidden}>Choose the type of help you need</legend>
            {CASE_SERVICES.map((option, index) => {
              const selected = values.service === option.value
              return (
                <label key={option.value} className={`${styles.option} ${selected ? styles.optionSelected : ""}`}>
                  <input
                    id={index === 0 ? `${formId}-service` : `${formId}-service-${option.value}`}
                    type="radio"
                    name="service"
                    value={option.value}
                    checked={selected}
                    onChange={() => update("service", option.value)}
                  />
                  <span className={styles.optionMark} aria-hidden="true">{selected ? <Check size={14} /> : null}</span>
                  <span>
                    <span className={styles.optionLabel}>{option.label}</span>
                    <span className={styles.optionCopy}>{option.description}</span>
                  </span>
                </label>
              )
            })}
            {errors.service ? <p id={`${formId}-service-error`} className={styles.error}>{errors.service}</p> : null}
          </fieldset>
        )}

        {step === 2 && (
          <div className={styles.fields}>
            <div className={styles.group}>
              <p className={styles.groupTitle}>Your details</p>
              <Field id={`${formId}-fullName`} label="Full name" error={errors.fullName}>
                <input name="fullName" value={values.fullName} onChange={(event) => update("fullName", event.target.value)} maxLength={enquiryLimits.fullName} autoComplete="name" autoCapitalize="words" required />
              </Field>
              <div className={styles.twoCol}>
                <Field id={`${formId}-email`} label="Email" error={errors.email}>
                  <input name="email" type="email" value={values.email} onChange={(event) => update("email", event.target.value)} maxLength={enquiryLimits.email} autoComplete="email" inputMode="email" required />
                </Field>
                <Field id={`${formId}-phone`} label="Phone number" optional error={errors.phone}>
                  <input name="phone" type="tel" value={values.phone} onChange={(event) => update("phone", event.target.value)} maxLength={enquiryLimits.phone} autoComplete="tel" inputMode="tel" />
                </Field>
              </div>
            </div>
            <div className={styles.group}>
              <p className={styles.groupTitle}>Your business</p>
              <Field id={`${formId}-businessName`} label="Business name" error={errors.businessName}>
                <input name="businessName" value={values.businessName} onChange={(event) => update("businessName", event.target.value)} maxLength={enquiryLimits.businessName} autoComplete="organization" required />
              </Field>
              <div className={styles.twoCol}>
                <Field id={`${formId}-country`} label="Country" error={errors.country}>
                  <input name="country" value={values.country} onChange={(event) => update("country", event.target.value)} maxLength={enquiryLimits.country} autoComplete="country-name" required />
                </Field>
                <Field id={`${formId}-websiteUrl`} label="Business website URL" optional error={errors.websiteUrl}>
                  <input name="websiteUrl" type="url" value={values.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} maxLength={enquiryLimits.websiteUrl} autoComplete="url" inputMode="url" placeholder="https://" />
                </Field>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.fields}>
            {showsBusinessProfileUrl(values.service) && (
              <Field id={`${formId}-businessProfileUrl`} label="Google Business Profile URL" optional error={errors.businessProfileUrl}>
                <input name="businessProfileUrl" type="url" value={values.businessProfileUrl} onChange={(event) => update("businessProfileUrl", event.target.value)} maxLength={enquiryLimits.businessProfileUrl} autoComplete="off" inputMode="url" placeholder="https://" />
              </Field>
            )}
            {showsReviewUrl(values.service) && (
              <Field id={`${formId}-reviewUrl`} label="Relevant review URL" optional error={errors.reviewUrl}>
                <input name="reviewUrl" type="url" value={values.reviewUrl} onChange={(event) => update("reviewUrl", event.target.value)} maxLength={enquiryLimits.reviewUrl} autoComplete="off" inputMode="url" placeholder="https://" />
              </Field>
            )}
            <Field
              id={`${formId}-details`}
              label="Tell us what happened"
              hint="Include when the issue started, messages you received, changes you noticed and steps you have already tried."
              error={errors.details}
            >
              <textarea name="details" value={values.details} onChange={(event) => update("details", event.target.value)} maxLength={enquiryLimits.details} rows={8} required />
            </Field>
            <div className={styles.metaRow}>
              <p className={styles.reminder}>Do not include passwords, verification codes or account credentials.</p>
              <p className={styles.counter} aria-live="polite">{values.details.length.toLocaleString("en-GB")} / 5,000</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.review}>
            <ReviewBlock title="Help needed" onEdit={() => goToStep(1)}>
              <ReviewItem label="Service" value={values.service ? caseServiceLabel(values.service) : "Not selected"} />
            </ReviewBlock>
            <ReviewBlock title="You and your business" onEdit={() => goToStep(2)}>
              <ReviewItem label="Name" value={values.fullName} />
              <ReviewItem label="Email" value={values.email} />
              <ReviewItem label="Phone" value={values.phone} />
              <ReviewItem label="Business" value={values.businessName} />
              <ReviewItem label="Country" value={values.country} />
              <ReviewItem label="Website" value={values.websiteUrl} />
            </ReviewBlock>
            <ReviewBlock title="The issue" onEdit={() => goToStep(3)}>
              {showsBusinessProfileUrl(values.service) && <ReviewItem label="Business Profile URL" value={values.businessProfileUrl} />}
              {showsReviewUrl(values.service) && <ReviewItem label="Review URL" value={values.reviewUrl} />}
              <ReviewItem label="What happened" value={values.details} wide />
            </ReviewBlock>
            <label className={styles.check} htmlFor={`${formId}-informationAccurate`}>
              <input id={`${formId}-informationAccurate`} name="informationAccurate" type="checkbox" checked={values.informationAccurate} onChange={(event) => update("informationAccurate", event.target.checked)} />
              <span>I confirm that the information provided is accurate to the best of my knowledge.</span>
            </label>
            {errors.informationAccurate ? <p className={styles.error}>{errors.informationAccurate}</p> : null}
            <label className={styles.check} htmlFor={`${formId}-privacyAccepted`}>
              <input id={`${formId}-privacyAccepted`} name="privacyAccepted" type="checkbox" checked={values.privacyAccepted} onChange={(event) => update("privacyAccepted", event.target.checked)} />
              <span>
                I understand how ReputeDefend handles this information, as described in the{" "}
                <Link href="/privacy">privacy information</Link>.
              </span>
            </label>
            {errors.privacyAccepted ? <p className={styles.error}>{errors.privacyAccepted}</p> : null}
          </div>
        )}
      </div>

      <HoneypotField />

      <div className={styles.actions}>
        {step > 1 ? (
          <button type="button" className={styles.back} onClick={goBack} disabled={status === "loading"}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
        ) : <span />}
        {step < 4 ? (
          <button type="submit" className={styles.next}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className={styles.next} disabled={status === "loading"}>
            {status === "loading" ? "Submitting…" : "Submit my case"}
          </button>
        )}
      </div>

      <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
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
  children: ReactElement<InputHTMLAttributes<HTMLInputElement> | TextareaHTMLAttributes<HTMLTextAreaElement>>
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

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className={styles.reviewBlock}>
      <div className={styles.reviewHead}>
        <h3>{title}</h3>
        <button type="button" onClick={onEdit}>Edit</button>
      </div>
      <dl>{children}</dl>
    </section>
  )
}

function ReviewItem({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? styles.reviewWide : undefined}>
      <dt>{label}</dt>
      <dd>{value.trim() ? value : "Not provided"}</dd>
    </div>
  )
}
