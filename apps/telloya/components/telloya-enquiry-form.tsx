"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react"
import styles from "./telloya-enquiry-form.module.css"
import type { TelloyaEnquiryRequest, TelloyaEnquiryResponse, TelloyaEnquiryCapabilities } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"

const PRODUCT_OPTIONS = [
  { value: "telloya", label: "Telloya", description: "AI receptionist for missed-call enquiries" },
  { value: "complete", label: "Complete", description: "Proposed package: Telloya plus Relaunch Guard profile monitoring" },
] as const

type ProductInterest = "telloya" | "complete" | ""

type EnquiryValues = {
  product: ProductInterest
  businessName: string
  country: string
  trade: string
  locations: string
  websiteUrl: string
  fullName: string
  email: string
  phone: string
  missedCallProblem: string
  phoneSetup: string
  contactPreference: string
  privacyAccepted: boolean
}

const INITIAL_VALUES: EnquiryValues = {
  product: "",
  businessName: "",
  country: "",
  trade: "",
  locations: "",
  websiteUrl: "",
  fullName: "",
  email: "",
  phone: "",
  missedCallProblem: "",
  phoneSetup: "",
  contactPreference: "",
  privacyAccepted: false,
}

type EnquiryFieldErrors = Partial<Record<keyof EnquiryValues, string>>

const STEP_TITLES = {
  1: "What are you interested in?",
  2: "About your business",
  3: "Contact and calling requirements",
  4: "Review and submit",
} as const

export function TelloyaEnquiryForm({ capabilities }: { capabilities?: TelloyaEnquiryCapabilities }) {
  const submissionEnabled = capabilities?.submissionEnabled ?? false
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [values, setValues] = useState<EnquiryValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<EnquiryFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [enquiryRef, setEnquiryRef] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  const submissionKeyRef = useRef("")
  const [focusKey, setFocusKey] = useState(0)
  const focusWhat = useRef<"heading" | "summary" | "success">("heading")

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

  function update<K extends keyof EnquiryValues>(key: K, value: EnquiryValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function validateStep(nextStep: 1 | 2 | 3 | 4): EnquiryFieldErrors {
    const stepErrors: EnquiryFieldErrors = {}

    if (nextStep >= 1) {
      if (!values.product) stepErrors.product = "Please select a product option."
    }

    if (nextStep >= 2) {
      if (!values.businessName) stepErrors.businessName = "Please enter your business name."
      if (!values.country) stepErrors.country = "Please enter your country."
      if (!values.trade) stepErrors.trade = "Please describe your trade or service."
    }

    if (nextStep >= 3) {
      if (!values.fullName) stepErrors.fullName = "Please enter your name."
      if (!values.email || !/^\S+@\S+\.\S+$/.test(values.email)) stepErrors.email = "Please enter a valid email address."
      if (!values.phone || !/^[+]?[\d\s().-]{7,}$/.test(values.phone)) stepErrors.phone = "Please enter a valid phone number."
    }

    if (nextStep >= 4) {
      if (!values.privacyAccepted) stepErrors.privacyAccepted = "Please confirm you have read the privacy notice."
    }

    return stepErrors
  }

  function continueToNext() {
    const stepErrors = validateStep((step + 1) as 2 | 3 | 4)
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
    if (step < 4) setStep((current) => ((current + 1) as 2 | 3 | 4))
    requestFocus("heading")
  }

  function goBack() {
    setStep((current) => (current > 1 ? (current - 1) as 1 | 2 | 3 : 1))
    requestFocus("heading")
  }

  function goToStep(targetStep: 1 | 2 | 3 | 4) {
    setErrors({})
    setDeliveryError(false)
    setStatusText("")
    setStep(targetStep)
    requestFocus("heading")
  }

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step < 4) {
      continueToNext()
      return
    }

    const allErrors = validateStep(4)
    if (Object.keys(allErrors).length) {
      setErrors(allErrors)
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before submitting.")
      requestFocus("summary")
      return
    }

    setStatus("loading")
    setDeliveryError(false)
    setStatusText("Submitting your enquiry.")

    if (!submissionKeyRef.current) {
      submissionKeyRef.current = crypto.randomUUID()
    }

    try {
      const payload: TelloyaEnquiryRequest = {
        product: values.product,
        businessName: values.businessName,
        country: values.country,
        trade: values.trade,
        locations: values.locations,
        websiteUrl: values.websiteUrl,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        missedCallProblem: values.missedCallProblem,
        phoneSetup: values.phoneSetup,
        contactPreference: values.contactPreference,
        privacyAccepted: values.privacyAccepted,
        source: "telloya",
        submissionKey: submissionKeyRef.current,
      }

      const res = await fetch("/api/telloya/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json() as TelloyaEnquiryResponse

      if (json.ok) {
        setEnquiryRef(json.enquiryRef || "")
        setStatus("success")
        setStatusText("Your enquiry has been received.")
        requestFocus("success")
        return
      }

      if (json.errors && Object.keys(json.errors).length) {
        setErrors(json.errors)
      }

      setStatus("idle")
      setDeliveryError(true)
      // Use the API's message if available, otherwise fall back to generic message
      setStatusText(json.message || "We couldn't submit your enquiry right now. Please try again shortly.")
      requestFocus("summary")
    } catch {
      setStatus("idle")
      setDeliveryError(true)
      setStatusText("We couldn't submit your enquiry right now. Please try again shortly.")
      requestFocus("summary")
    }
  }

  if (status === "success") {
    return (
      <div className={styles.success} role="status">
        <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>Thank you — we have received your enquiry</h2>
        {enquiryRef && (
          <>
            <p className={styles.refLabel}>Enquiry reference</p>
            <p className={styles.refValue}>{enquiryRef}</p>
          </>
        )}
        <p>Your request is safely recorded. Our team will review the details and get in touch soon.</p>
      </div>
    )
  }

  const errorEntries = Object.entries(errors) as [keyof EnquiryValues, string][]
  const showSummary = errorEntries.length > 0 || deliveryError

  if (!submissionEnabled) {
    return (
      <div className={styles.prelaunch} role="status">
        <div className={styles.prelaunchIcon}>
          <Mail size={32} aria-hidden="true" />
        </div>
        <h3 className={styles.prelaunchTitle}>Online enquiry submission is being prepared</h3>
        <p className={styles.prelaunchLead}>
          We&apos;re finalising the Telloya enquiry system before public launch. In the meantime, please email us directly to discuss your requirements.
        </p>
        <div className={styles.prelaunchContact}>
          <p className={styles.prelaunchLabel}>Contact us at</p>
          <a href={`mailto:${legalIdentity.contactEmail}`} className={styles.prelaunchEmail}>
            {legalIdentity.contactEmail}
          </a>
        </div>
        <p className={styles.prelaunchNote}>
          Include details about your business, trade, and the missed-call challenge you&apos;re facing. We&apos;ll get back to you promptly.
        </p>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={submitEnquiry} noValidate aria-busy={status === "loading"}>
      <div className={styles.progress}>
        <p className={styles.progressLabel} id={`${formId}-progress`}>Step {step} of 4</p>
        <div className={styles.progressTrack} role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step} aria-labelledby={`${formId}-progress`}>
          <span style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>{STEP_TITLES[step]}</h2>
      </div>

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary}>
          {deliveryError && <p>{statusText}</p>}
          {errorEntries.length > 0 && (
            <>
              <p>Please correct the following:</p>
              <ul>
                {errorEntries.map(([field, message]) => (
                  <li key={field}><button type="button" onClick={() => document.getElementById(`${formId}-${field}`)?.focus()}>{message}</button></li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className={styles.panel}>
        {step === 1 && (
          <fieldset className={styles.options}>
            <legend className={styles.visuallyHidden}>Choose your product interest</legend>
            {PRODUCT_OPTIONS.map((option) => {
              const selected = values.product === option.value
              return (
                <label key={option.value} className={`${styles.option} ${selected ? styles.optionSelected : ""}`}>
                  <input
                    id={`${formId}-${option.value}`}
                    type="radio"
                    name="product"
                    value={option.value}
                    checked={selected}
                    onChange={() => update("product", option.value)}
                  />
                  <span className={styles.optionMark} aria-hidden="true">{selected && <Check size={14} />}</span>
                  <span>
                    <span className={styles.optionLabel}>{option.label}</span>
                    <span className={styles.optionCopy}>{option.description}</span>
                  </span>
                </label>
              )
            })}
            {errors.product && <p className={styles.error}>{errors.product}</p>}
          </fieldset>
        )}

        {step === 2 && (
          <div className={styles.fields}>
            <Field id={`${formId}-businessName`} label="Business name" error={errors.businessName}>
              <input name="businessName" value={values.businessName} onChange={(e) => update("businessName", e.target.value)} maxLength={160} required />
            </Field>
            <div className={styles.twoCol}>
              <Field id={`${formId}-country`} label="Country" error={errors.country}>
                <input name="country" value={values.country} onChange={(e) => update("country", e.target.value)} maxLength={80} required />
              </Field>
              <Field id={`${formId}-trade`} label="Trade or service" error={errors.trade}>
                <input name="trade" value={values.trade} onChange={(e) => update("trade", e.target.value)} maxLength={100} required />
              </Field>
            </div>
            <Field id={`${formId}-locations`} label="Number of locations" optional error={errors.locations}>
              <input name="locations" value={values.locations} onChange={(e) => update("locations", e.target.value)} maxLength={50} />
            </Field>
            <Field id={`${formId}-websiteUrl`} label="Business website URL" optional error={errors.websiteUrl}>
              <input name="websiteUrl" type="url" value={values.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} maxLength={1000} placeholder="https://www.example.com" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className={styles.fields}>
            <Field id={`${formId}-fullName`} label="Your name" error={errors.fullName}>
              <input name="fullName" value={values.fullName} onChange={(e) => update("fullName", e.target.value)} maxLength={100} autoComplete="name" required />
            </Field>
            <div className={styles.twoCol}>
              <Field id={`${formId}-email`} label="Email" error={errors.email}>
                <input name="email" type="email" value={values.email} onChange={(e) => update("email", e.target.value)} maxLength={254} autoComplete="email" inputMode="email" required />
              </Field>
              <Field id={`${formId}-phone`} label="Phone number" error={errors.phone}>
                <input name="phone" type="tel" value={values.phone} onChange={(e) => update("phone", e.target.value)} maxLength={40} autoComplete="tel" inputMode="tel" required />
              </Field>
            </div>
            <Field id={`${formId}-missedCallProblem`} label="Tell us about your missed-call challenge" optional error={errors.missedCallProblem}>
              <textarea name="missedCallProblem" value={values.missedCallProblem} onChange={(e) => update("missedCallProblem", e.target.value)} maxLength={500} rows={4} />
            </Field>
            <Field id={`${formId}-phoneSetup`} label="Your current phone setup" optional error={errors.phoneSetup} hint="e.g., mobile, landline, VoIP provider">
              <input name="phoneSetup" value={values.phoneSetup} onChange={(e) => update("phoneSetup", e.target.value)} maxLength={200} />
            </Field>
            <Field id={`${formId}-contactPreference`} label="Best time to contact you" optional error={errors.contactPreference}>
              <input name="contactPreference" value={values.contactPreference} onChange={(e) => update("contactPreference", e.target.value)} maxLength={100} placeholder="e.g., Weekday mornings" />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className={styles.reviewIntro}>
            <p className={styles.reviewIntro}>Check the details below before submitting your enquiry. You can go back and change anything that doesn&apos;t look right.</p>
            <ReviewBlock title="Product interest" onEdit={() => goToStep(1)}>
              <ReviewItem label="Product" value={values.product ? PRODUCT_OPTIONS.find(p => p.value === values.product)?.label || values.product : "Not selected"} />
            </ReviewBlock>
            <ReviewBlock title="Your business" onEdit={() => goToStep(2)}>
              <ReviewItem label="Business name" value={values.businessName} />
              <ReviewItem label="Country" value={values.country} />
              <ReviewItem label="Trade" value={values.trade} />
              <ReviewItem label="Locations" value={values.locations} />
              <ReviewItem label="Website" value={values.websiteUrl} />
            </ReviewBlock>
            <ReviewBlock title="Contact details" onEdit={() => goToStep(3)}>
              <ReviewItem label="Name" value={values.fullName} />
              <ReviewItem label="Email" value={values.email} />
              <ReviewItem label="Phone" value={values.phone} />
              <ReviewItem label="Missed-call challenge" value={values.missedCallProblem} wide />
              <ReviewItem label="Phone setup" value={values.phoneSetup} />
              <ReviewItem label="Contact preference" value={values.contactPreference} />
            </ReviewBlock>
            <label className={styles.check} htmlFor={`${formId}-privacyAccepted`}>
              <input
                id={`${formId}-privacyAccepted`}
                name="privacyAccepted"
                type="checkbox"
                checked={values.privacyAccepted}
                onChange={(e) => update("privacyAccepted", e.target.checked)}
              />
              <span>
                I understand how Telloya handles this information, as described in the{" "}
                <Link href="https://profilerelaunch.com/privacy" target="_blank" rel="noopener noreferrer">privacy notice</Link>.
              </span>
            </label>
            {errors.privacyAccepted && <p className={styles.error}>{errors.privacyAccepted}</p>}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {step > 1 ? (
          <button type="button" className={styles.back} onClick={goBack} disabled={status === "loading"}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
        ) : <span />}
        {step < 4 ? (
          <button type="button" className={styles.next} onClick={continueToNext}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className={styles.next} disabled={status === "loading"}>
            {status === "loading" ? "Submitting…" : "Submit enquiry"}
          </button>
        )}
      </div>

      {step === 4 && (
        <p className={styles.submitNote}>We will contact you to discuss your requirements. No payment is taken when you submit this enquiry.</p>
      )}

      <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
    </form>
  )
}

function Field({
  id, label, optional, hint, error, children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: string
  error?: string
  children: ReactElement<{ id?: string; className?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}{optional && <span>Optional</span>}</label>
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {cloneElement(children, {
        id,
        className: styles.control,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error && <p id={errorId} className={styles.error}>{error}</p>}
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
