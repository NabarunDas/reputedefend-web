"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, CircleHelp } from "lucide-react"
import {
  FORMAL_CASE_SERVICES,
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
import { sendLeadConversion } from "@/lib/analytics"
import { HoneypotField } from "@/components/honeypot-field"
import { CountryCombobox } from "@/components/country-combobox"
import { countryLabel } from "@/lib/countries"
import { brandName } from "@/lib/brand"
import styles from "./case-intake.module.css"

export const STEP_TITLES = {
  1: "What do you need help with?",
  2: "About you and your business",
  3: "Tell us what happened",
  4: "Review and send",
} as const

export const DETAILS_HINTS = {
  "profile-recovery":
    "You can include when the issue started, any suspension, disabled or verification message, what changed beforehand, what you have already tried, whether an appeal or recovery attempt was already made, and Google's response if there was one. Start with what you know — you do not need a separate answer for each point.",
  "profile-access":
    "You can include when the issue started, any verification, ownership or access message, what changed beforehand, what you have already tried, and Google's response if there was one. Start with what you know — you do not need a separate answer for each point.",
  "review-protection":
    "You can include what concerns you about the review, when it appeared, whether it appears connected to a genuine customer interaction, whether it has already been reported, Google's response if any, and what evidence or context exists. Start with what you know — you do not need a separate answer for each point.",
  general:
    "You can include what changed, what you noticed, what Google said and what you have already tried. You do not need to know the cause, and you do not need a separate answer for each point.",
  "":
    "Include when the issue started, any messages you received, changes you noticed and what you have already tried. You don't need to know the cause.",
} as const

export const COUNTRY_HINT =
  "Where this business is located. This is the business location, not a verified purchasing establishment, and it does not decide whether you can request help."

export const WEBSITE_HINT =
  "Optional. For example, https://www.example.com. Leave this blank if the business has no website."

export const PROFILE_URL_HINT =
  "Optional. In Google Maps, open the profile, choose Share, and copy the link (for example https://maps.app.goo.gl/…). Leave this blank if the profile is suspended, missing, or you cannot open it. Do not enter a Google password or verification code."

export const REVIEW_URL_HINT =
  "Optional. Paste a link to the review, such as a Google Maps share link. Leave this blank if the review is missing or you cannot open it."

export const EVIDENCE_NOTE =
  "Start with the links, messages and details you have. If additional documents or screenshots would materially help the assessment, we'll tell you what is needed after reviewing your submission."

export const SUBMIT_NOTE = "No payment is taken when you submit the assessment."

export const SUCCESS_COPY = {
  title: "Thank you — we have received your assessment.",
  body: "Our team will review what you have shared and get in touch if we need anything else. We will explain the next steps and any optional paid support before you make a decision."
} as const

export const PERSISTED_SUCCESS_COPY = {
  title: "Thank you — we have received your assessment.",
  referenceLabel: "Case reference",
  review: "Your request is safely recorded. Our team will review the details and get in touch if we need anything else.",
  keep: "Please keep this reference handy so we can find your case quickly if you contact us.",
  emailSent: "A confirmation email is on its way. Please check your inbox and, if needed, your spam folder.",
  emailConfirm: "Your assessment is safely recorded. Please check your email and confirm your address so we can contact you securely.",
  emailSuppressed: "You do not need to submit your assessment again. Please keep this case reference for your records.",
  emailFailed: "We could not send a confirmation email just now, but your request is safely recorded. Please keep this case reference.",
} as const

export const SIMULATED_COPY = {
  kicker: "Development simulation",
  title: "This is not a live case submission.",
  body: "The form worked, but nothing was delivered to a production inbox or CRM. In production, this confirmation will only appear after the assessment has actually been sent.",
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
  const [persistedRef, setPersistedRef] = useState("")
  const [receiptEmailSent, setReceiptEmailSent] = useState(false)
  const [receiptEmailStatus, setReceiptEmailStatus] = useState<"sent" | "suppressed" | "unavailable" | "">("")
  const [emailConfirmationPending, setEmailConfirmationPending] = useState(false)
  const [statusText, setStatusText] = useState("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const submissionKeyRef = useRef("")
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
    if (step < 4) setStep((current) => ((current + 1) as 2 | 3 | 4))
    requestFocus("heading")
  }

  function goBack() {
    goToStep((step > 1 ? step - 1 : 1) as 1 | 2 | 3)
  }

  async function submitCase(event: FormEvent<HTMLFormElement> | { preventDefault: () => void; currentTarget: EventTarget | null }) {
    event.preventDefault()
    if (step < 4) {
      continueToNext()
      return
    }

    const form = event.currentTarget instanceof HTMLFormElement
      ? event.currentTarget
      : event.currentTarget instanceof HTMLButtonElement
        ? event.currentTarget.form
        : null
    const companyFax = form ? new FormData(form).get("companyFax") : ""
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
    setStatusText("Sending your case.")

    if (!submissionKeyRef.current) {
      submissionKeyRef.current = window.crypto.randomUUID()
    }

    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, submissionKey: submissionKeyRef.current }),
      })
      const json = await res.json() as {
        ok?: boolean
        simulated?: boolean
        persisted?: boolean
        caseRef?: string
        receiptEmailSent?: boolean
        receiptEmailStatus?: "sent" | "suppressed" | "unavailable"
        emailConfirmation?: "pending" | "omitted"
        errors?: EnquiryFieldErrors
      }

      if (json.ok) {
        setSimulated(json.simulated === true)
        setPersistedRef(json.persisted && json.caseRef ? json.caseRef : "")
        setReceiptEmailSent(json.receiptEmailSent === true)
        setEmailConfirmationPending(json.emailConfirmation === "pending")
        setReceiptEmailStatus(
          json.receiptEmailStatus === "sent" || json.receiptEmailStatus === "suppressed" || json.receiptEmailStatus === "unavailable"
            ? json.receiptEmailStatus
            : json.receiptEmailSent === true ? "sent" : "unavailable",
        )
        setStatus("success")
        setStatusText(json.simulated ? "Development simulation complete." : "Your case has been received.")
        // Validated service enum only. The case reference is never sent.
        if (json.simulated !== true) {
          sendLeadConversion({ leadType: "assessment", serviceType: values.service || undefined })
        }
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
      <div className={`${styles.success} ${simulated ? styles.successSimulated : ""}`} role="status">
        {simulated ? (
          <>
            <p className={styles.simulated}>{SIMULATED_COPY.kicker}</p>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>{SIMULATED_COPY.title}</h2>
            <p>{SIMULATED_COPY.body}</p>
          </>
        ) : persistedRef ? (
          <>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>{PERSISTED_SUCCESS_COPY.title}</h2>
            <p className={styles.caseRefLabel}>{PERSISTED_SUCCESS_COPY.referenceLabel}</p>
            <p className={styles.caseRef}>{persistedRef}</p>
            <p>{PERSISTED_SUCCESS_COPY.review}</p>
            <p>{PERSISTED_SUCCESS_COPY.keep}</p>
            <p>{
              receiptEmailStatus === "suppressed"
                ? PERSISTED_SUCCESS_COPY.emailSuppressed
                : emailConfirmationPending && (receiptEmailSent || receiptEmailStatus === "sent")
                  ? PERSISTED_SUCCESS_COPY.emailConfirm
                  : receiptEmailSent || receiptEmailStatus === "sent"
                    ? PERSISTED_SUCCESS_COPY.emailSent
                    : PERSISTED_SUCCESS_COPY.emailFailed
            }</p>
          </>
        ) : (
          <>
            <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>{SUCCESS_COPY.title}</h2>
            <p>{SUCCESS_COPY.body}</p>
          </>
        )}
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
          <>
          <fieldset className={styles.options} aria-invalid={Boolean(errors.service) || undefined} aria-describedby={errors.service ? `${formId}-service-error` : undefined}>
            <legend className={styles.visuallyHidden}>Choose the type of help you need</legend>
            {FORMAL_CASE_SERVICES.map((option, index) => {
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
                    {selected ? <span className={styles.optionState}>Selected</span> : null}
                  </span>
                </label>
              )
            })}
            {errors.service ? <p id={`${formId}-service-error`} className={styles.error}>{errors.service}</p> : null}
          </fieldset>
          <p className={styles.contactHint}>
            General questions belong on the <Link href="/contact">Contact</Link> page.
          </p>
          </>
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
              <Field id={`${formId}-country`} label="Country" hint={COUNTRY_HINT} error={errors.country}>
                <CountryCombobox name="country" value={values.country} onChange={(next) => update("country", next)} required />
              </Field>
              <Field id={`${formId}-websiteUrl`} label="Business website URL" hint={WEBSITE_HINT} optional error={errors.websiteUrl}>
                <input name="websiteUrl" type="url" value={values.websiteUrl} onChange={(event) => update("websiteUrl", event.target.value)} maxLength={enquiryLimits.websiteUrl} autoComplete="url" inputMode="url" placeholder="https://www.example.com" />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.fields}>
            {showsBusinessProfileUrl(values.service) && (
              <Field id={`${formId}-businessProfileUrl`} label="Google Business Profile URL" hint={PROFILE_URL_HINT} hintAsHelp optional error={errors.businessProfileUrl}
                helpContent={<>
                  <p>To find your link:</p>
                  <ol>
                    <li>Open the listing in Google Maps.</li>
                    <li>Choose <strong>Share</strong>, then <strong>Copy link</strong>.</li>
                    <li>Paste the link into the field below.</li>
                  </ol>
                  <p>Example: <code>https://maps.app.goo.gl/…</code></p>
                  <p>Leave it blank if the listing is suspended, missing, or cannot be opened.</p>
                  <p>Never enter a Google password or verification code.</p>
                </>}>
                <input name="businessProfileUrl" type="url" value={values.businessProfileUrl} onChange={(event) => update("businessProfileUrl", event.target.value)} maxLength={enquiryLimits.businessProfileUrl} autoComplete="off" inputMode="url" placeholder="https://maps.app.goo.gl/…" />
              </Field>
            )}
            {showsReviewUrl(values.service) && (
              <Field id={`${formId}-reviewUrl`} label="Relevant review URL" hint={REVIEW_URL_HINT} hintAsHelp optional error={errors.reviewUrl}>
                <input name="reviewUrl" type="url" value={values.reviewUrl} onChange={(event) => update("reviewUrl", event.target.value)} maxLength={enquiryLimits.reviewUrl} autoComplete="off" inputMode="url" placeholder="https://maps.app.goo.gl/…" />
              </Field>
            )}
            <Field
              id={`${formId}-details`}
              label="Tell us what happened"
              hint={DETAILS_HINTS[values.service || ""]}
              hintAsHelp
              error={errors.details}
            >
              <textarea name="details" value={values.details} onChange={(event) => update("details", event.target.value)} maxLength={enquiryLimits.details} rows={8} required />
            </Field>
            <p className={styles.evidence}>{EVIDENCE_NOTE}</p>
            <div className={styles.metaRow}>
              <p className={styles.reminder}>Never send passwords, OTPs, verification codes or security answers.</p>
              <p className={styles.counter} aria-live="polite">{values.details.length.toLocaleString("en-GB")} / 5,000</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.review}>
            <p className={styles.reviewIntro}>Check the details below before submitting your assessment. You can go back and change anything that doesn&apos;t look right.</p>
            <ReviewBlock title="Help needed" onEdit={() => goToStep(1)}>
              <ReviewItem label="Service" value={values.service ? caseServiceLabel(values.service) : "Not selected"} />
            </ReviewBlock>
            <ReviewBlock title="You and your business" onEdit={() => goToStep(2)}>
              <ReviewItem label="Name" value={values.fullName} />
              <ReviewItem label="Email" value={values.email} />
              <ReviewItem label="Phone" value={values.phone} />
              <ReviewItem label="Business" value={values.businessName} />
              <ReviewItem label="Country" value={countryLabel(values.country)} />
              <ReviewItem label="Website" value={values.websiteUrl} />
            </ReviewBlock>
            <ReviewBlock title="The issue" onEdit={() => goToStep(3)}>
              {showsBusinessProfileUrl(values.service) && <ReviewItem label="Business Profile URL" value={values.businessProfileUrl} />}
              {showsReviewUrl(values.service) && <ReviewItem label="Review URL" value={values.reviewUrl} />}
              <ReviewItem label="What happened" value={values.details} wide />
            </ReviewBlock>
            <label className={styles.check} htmlFor={`${formId}-informationAccurate`}>
              <input
                id={`${formId}-informationAccurate`}
                name="informationAccurate"
                type="checkbox"
                checked={values.informationAccurate}
                onChange={(event) => update("informationAccurate", event.target.checked)}
                aria-invalid={Boolean(errors.informationAccurate) || undefined}
                aria-describedby={errors.informationAccurate ? `${formId}-informationAccurate-error` : undefined}
              />
              <span>I confirm that the information provided is accurate to the best of my knowledge.</span>
            </label>
            {errors.informationAccurate ? <p id={`${formId}-informationAccurate-error`} className={styles.error}>{errors.informationAccurate}</p> : null}
            <label className={styles.check} htmlFor={`${formId}-privacyAccepted`}>
              <input
                id={`${formId}-privacyAccepted`}
                name="privacyAccepted"
                type="checkbox"
                checked={values.privacyAccepted}
                onChange={(event) => update("privacyAccepted", event.target.checked)}
                aria-invalid={Boolean(errors.privacyAccepted) || undefined}
                aria-describedby={errors.privacyAccepted ? `${formId}-privacyAccepted-error` : undefined}
              />
              <span>
                I understand how {brandName} handles this information, as described in the{" "}
                <Link href="/privacy">privacy notice</Link>.
              </span>
            </label>
            {errors.privacyAccepted ? <p id={`${formId}-privacyAccepted-error`} className={styles.error}>{errors.privacyAccepted}</p> : null}
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
          // A separate element from Submit. Enter on Continue must not retarget a
          // control that has just become type="submit", which would validate the
          // unchecked review boxes in the same keydown.
          <button key="continue" type="button" className={styles.next} onClick={continueToNext}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button key="submit" type="button" className={styles.next} disabled={status === "loading"} aria-describedby={`${formId}-submit-note`} onClick={submitCase}>
            {status === "loading" ? "Submitting…" : "Submit assessment"}
          </button>
        )}
      </div>
      {step === 4 ? (
        <div className={styles.submitNotes}>
          <p id={`${formId}-submit-note`}>{SUBMIT_NOTE}</p>
        </div>
      ) : null}

      <p className={styles.visuallyHidden} aria-live="polite">{statusText}</p>
    </form>
  )
}

function Field({
  id, label, optional, hint, hintAsHelp, helpContent, error, children,
}: {
  id: string
  label: string
  optional?: boolean
  hint?: string
  hintAsHelp?: boolean
  helpContent?: ReactNode
  error?: string
  children: ReactElement<{ id?: string; className?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>
}) {
  const showHelp = Boolean(hint && hintAsHelp)
  const hintId = hint && !showHelp ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  return (
    <div className={styles.field}>
      {showHelp ? (
        <div className={styles.fieldHeading}>
          <label htmlFor={id}>{label}</label>
          <HelpPopover id={id} label={label}>
            {helpContent ?? <p>{hint}</p>}
          </HelpPopover>
          {optional ? <span className={styles.helpOptional}>Optional</span> : null}
        </div>
      ) : (
        <label htmlFor={id}>{label}{optional ? <span>Optional</span> : null}</label>
      )}
      {hint && !showHelp ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
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

function HelpPopover({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onOutside(event: PointerEvent) {
      if (host.current && !host.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onOutside)
    return () => document.removeEventListener("pointerdown", onOutside)
  }, [open])

  return (
    <div
      className={styles.helpTrigger}
      ref={host}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        className={styles.helpButton}
        aria-label={label === "Google Business Profile URL"
          ? "How to find the Google Maps link"
          : label === "Relevant review URL"
            ? "How to find the review link"
            : label === "Tell us what happened"
              ? "Tips for describing the issue"
              : `Help for ${label}`}
        aria-expanded={open}
        aria-controls={`${id}-help`}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            setOpen(false)
            event.currentTarget.blur()
          }
        }}
      >
        <CircleHelp size={18} aria-hidden="true" />
      </button>
      {open ? <div id={`${id}-help`} className={styles.helpPanel} role="note">{children}</div> : null}
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
