"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react"
import styles from "./telloya-enquiry-form.module.css"
import type { TelloyaEnquiryRequest, TelloyaEnquiryResponse, TelloyaEnquiryCapabilities } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"
import { telloyaPlans, relaunchGuardAddon, overagePolicy, formatGbpPrice, formatMinutes, type TelloyaPlanTier } from "@/lib/pricing"

type PlanTierInterest = TelloyaPlanTier | ""
type VoicePreferenceChoice = "female" | "male" | "no-preference" | ""
type SpeakingStyleChoice = "friendly" | "professional" | "calm" | "no-preference" | ""

type EnquiryValues = {
  // Legacy product field for backward compatibility
  product: "telloya" | "complete" | ""
  // Plan tier selection
  planTier: PlanTierInterest
  // Relaunch Guard add-on
  guardInterested: boolean
  guardLocationCount: string
  // Custom plan requirements
  customMonthlyMinutes: string
  customMonthlyCalls: string
  customPhoneNumbers: string
  customLocations: string
  customLanguages: string
  customRequirements: string
  // Voice and language preferences
  voicePreference: VoicePreferenceChoice
  voiceAccent: string
  primaryLanguage: string
  speakingStyle: SpeakingStyleChoice
  additionalLanguages: string
  // Overage interest
  overageInterested: boolean
  overageMonthlyCapGbp: string
  // Business details
  businessName: string
  country: string
  trade: string
  locations: string
  websiteUrl: string
  // Contact details
  fullName: string
  email: string
  phone: string
  missedCallProblem: string
  phoneSetup: string
  contactPreference: string
  // Consent
  privacyAccepted: boolean
}

const INITIAL_VALUES: EnquiryValues = {
  product: "",
  planTier: "",
  guardInterested: false,
  guardLocationCount: "",
  customMonthlyMinutes: "",
  customMonthlyCalls: "",
  customPhoneNumbers: "",
  customLocations: "",
  customLanguages: "",
  customRequirements: "",
  voicePreference: "",
  voiceAccent: "",
  primaryLanguage: "",
  speakingStyle: "",
  additionalLanguages: "",
  overageInterested: false,
  overageMonthlyCapGbp: "",
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
  1: "Choose your plan",
  2: "About your business",
  3: "Contact and preferences",
  4: "Review and submit",
} as const

export function TelloyaEnquiryForm({ 
  capabilities, 
  initialPlanTier = "", 
  initialGuardInterested = false 
}: { 
  capabilities?: TelloyaEnquiryCapabilities; 
  initialPlanTier?: PlanTierInterest;
  initialGuardInterested?: boolean;
}) {
  const submissionEnabled = capabilities?.submissionEnabled ?? false
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [values, setValues] = useState<EnquiryValues>({ 
    ...INITIAL_VALUES, 
    planTier: initialPlanTier,
    guardInterested: initialGuardInterested 
  })
  const [errors, setErrors] = useState<EnquiryFieldErrors>({})
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [deliveryError, setDeliveryError] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [enquiryRef, setEnquiryRef] = useState("")
  const [copySuccess, setCopySuccess] = useState(false)
  const [receiptEmailStatus, setReceiptEmailStatus] = useState<"sent" | "suppressed" | "unavailable" | "">("")
  const headingRef = useRef<HTMLHeadingElement>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)
  const formId = useId()
  const submissionKeyRef = useRef("")
  const lastPayloadRef = useRef("")
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

  async function copyReference() {
    if (!enquiryRef) return
    try {
      await navigator.clipboard.writeText(enquiryRef)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement("input")
      input.value = enquiryRef
      document.body.appendChild(input)
      input.select()
      try {
        document.execCommand("copy")
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch {
        // Silently fail
      }
      document.body.removeChild(input)
    }
  }

  function update<K extends keyof EnquiryValues>(key: K, value: EnquiryValues[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value }
      // Auto-set product to "telloya" when any plan tier is selected
      // This maintains backward compatibility with validation that checks product field
      if (key === "planTier" && value && !current.product) {
        next.product = "telloya"
      }
      return next
    })
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
      // Check for plan tier selection (or legacy product field for backward compatibility)
      if (!values.planTier && !values.product) {
        stepErrors.planTier = "Please select a plan."
      }

      // Validate Guard location count if Guard is interested
      if (values.guardInterested) {
        const guardCount = values.guardLocationCount?.trim()
        if (!guardCount) {
          stepErrors.guardLocationCount = "Please enter the number of locations."
        } else {
          const parsed = Number(guardCount)
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
            stepErrors.guardLocationCount = "Please enter a whole number between 1 and 999."
          }
        }
      }

      // Validate Custom plan requirements
      if (values.planTier === "custom") {
        // Monthly minutes (required)
        const minutes = values.customMonthlyMinutes?.trim()
        if (!minutes) {
          stepErrors.customMonthlyMinutes = "Please enter monthly minutes required."
        } else {
          const parsed = Number(minutes)
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000000) {
            stepErrors.customMonthlyMinutes = "Please enter a whole number between 1 and 1,000,000."
          }
        }

        // Monthly calls (optional, but if provided must be valid)
        const calls = values.customMonthlyCalls?.trim()
        if (calls) {
          const parsed = Number(calls)
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) {
            stepErrors.customMonthlyCalls = "Please enter a whole number between 1 and 100,000."
          }
        }

        // Phone numbers (required)
        const phones = values.customPhoneNumbers?.trim()
        if (!phones) {
          stepErrors.customPhoneNumbers = "Please enter the number of phone numbers."
        } else {
          const parsed = Number(phones)
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
            stepErrors.customPhoneNumbers = "Please enter a whole number between 1 and 999."
          }
        }

        // Locations (required)
        const locs = values.customLocations?.trim()
        if (!locs) {
          stepErrors.customLocations = "Please enter the number of locations."
        } else {
          const parsed = Number(locs)
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9999) {
            stepErrors.customLocations = "Please enter a whole number between 1 and 9,999."
          }
        }

        // Custom requirements (optional text field, validated on server for length)
      }

      // Validate overage spending cap if overage is interested
      if (values.overageInterested) {
        const cap = values.overageMonthlyCapGbp?.trim()
        if (!cap) {
          stepErrors.overageMonthlyCapGbp = "Please enter a monthly spending cap."
        } else {
          const parsed = Number(cap)
          // Allow decimal values for currency, but must be positive
          if (isNaN(parsed) || parsed < 1 || parsed > 100000) {
            stepErrors.overageMonthlyCapGbp = "Please enter an amount between £1 and £100,000."
          }
        }
      }
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
    // Validate only the current completed step before advancing
    const stepErrors = validateStep(step)
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

    // Strict numeric conversion helpers - values already validated in validateStep()
    const toInteger = (val: string | undefined): number | undefined => {
      if (!val) return undefined
      const num = Number(val)
      return Number.isInteger(num) ? num : undefined
    }
    const toNumber = (val: string | undefined): number | undefined => {
      if (!val) return undefined
      const num = Number(val)
      return Number.isFinite(num) ? num : undefined
    }

    // Create payload to check if it has changed
    const payload: TelloyaEnquiryRequest = {
      product: values.product || "telloya",
      planTier: values.planTier,
      guardInterested: values.guardInterested,
      guardLocationCount: toInteger(values.guardLocationCount),
      customMonthlyMinutes: toInteger(values.customMonthlyMinutes),
      customMonthlyCalls: toInteger(values.customMonthlyCalls),
      customPhoneNumbers: toInteger(values.customPhoneNumbers),
      customLocations: toInteger(values.customLocations),
      customLanguages: values.customLanguages || undefined,
      customRequirements: values.customRequirements || undefined,
      voicePreference: values.voicePreference || undefined,
      voiceAccent: values.voiceAccent || undefined,
      primaryLanguage: values.primaryLanguage || undefined,
      speakingStyle: values.speakingStyle || undefined,
      additionalLanguages: values.additionalLanguages || undefined,
      overageInterested: values.overageInterested,
      overageMonthlyCapGbp: toNumber(values.overageMonthlyCapGbp),
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
      submissionKey: "", // Will be set below
    }

    // Generate canonical payload fingerprint (without submissionKey)
    const payloadFingerprint = JSON.stringify({
      product: payload.product,
      planTier: payload.planTier,
      guardInterested: payload.guardInterested,
      guardLocationCount: payload.guardLocationCount,
      customMonthlyMinutes: payload.customMonthlyMinutes,
      customMonthlyCalls: payload.customMonthlyCalls,
      customPhoneNumbers: payload.customPhoneNumbers,
      customLocations: payload.customLocations,
      customLanguages: payload.customLanguages,
      customRequirements: payload.customRequirements,
      voicePreference: payload.voicePreference,
      voiceAccent: payload.voiceAccent,
      primaryLanguage: payload.primaryLanguage,
      speakingStyle: payload.speakingStyle,
      additionalLanguages: payload.additionalLanguages,
      overageInterested: payload.overageInterested,
      overageMonthlyCapGbp: payload.overageMonthlyCapGbp,
      businessName: payload.businessName,
      country: payload.country,
      trade: payload.trade,
      locations: payload.locations,
      websiteUrl: payload.websiteUrl,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      missedCallProblem: payload.missedCallProblem,
      phoneSetup: payload.phoneSetup,
      contactPreference: payload.contactPreference,
      privacyAccepted: payload.privacyAccepted,
    })

    // Generate new submission key only if payload changed, otherwise reuse for retry
    if (!submissionKeyRef.current || lastPayloadRef.current !== payloadFingerprint) {
      submissionKeyRef.current = crypto.randomUUID()
      lastPayloadRef.current = payloadFingerprint
    }

    payload.submissionKey = submissionKeyRef.current

    try {
      const res = await fetch("/api/telloya/enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json() as TelloyaEnquiryResponse

      if (json.ok) {
        // Require actual TY reference before showing success
        if (json.enquiryRef && /^TY-\d\d-[A-HJ-NP-Z2-9]{6}$/.test(json.enquiryRef)) {
          setEnquiryRef(json.enquiryRef)
          setReceiptEmailStatus(json.receiptEmailStatus || "")
          setStatus("success")
          setStatusText("Your enquiry has been received.")
          requestFocus("success")
          return
        } else {
          // Success response without valid TY reference - treat as error
          setStatus("idle")
          setDeliveryError(true)
          setStatusText("Unable to complete this enquiry right now.")
          requestFocus("summary")
          return
        }
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
    const emailStatusMessage = receiptEmailStatus === "sent"
      ? "A confirmation email has been accepted by the email provider. Please check your inbox and, if needed, your spam folder. Provider acceptance does not guarantee inbox delivery."
      : receiptEmailStatus === "suppressed"
        ? "No confirmation email was requested. Your enquiry is safely recorded."
        : receiptEmailStatus === "unavailable"
          ? "We could not send a confirmation email, but your enquiry is safely recorded. Please keep this reference."
          : ""
    
    return (
      <div className={styles.success} role="status">
        <h2 ref={successRef} tabIndex={-1} className={styles.successTitle}>
          Thank you — we have received your enquiry
        </h2>
        {enquiryRef && (
          <div className={styles.refGroup}>
            <p className={styles.refLabel}>Enquiry reference</p>
            <div className={styles.refRow}>
              <p className={styles.refValue}>{enquiryRef}</p>
              <button 
                type="button" 
                onClick={copyReference}
                className={styles.copyButton}
                aria-label={copySuccess ? "Reference copied" : "Copy reference"}
              >
                {copySuccess ? (
                  <>
                    <Check size={16} aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>Copy</>
                )}
              </button>
            </div>
          </div>
        )}
        <p className={styles.successBody}>
          Your request is safely recorded. Our team will review the details and get in touch soon.
        </p>
        <p className={styles.successNote}>
          Please keep this reference handy so we can find your enquiry quickly if you contact us.
        </p>
        {emailStatusMessage && (
          <p className={styles.successNote}>{emailStatusMessage}</p>
        )}
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
          <>
            <fieldset className={styles.options}>
              <legend className={styles.visuallyHidden}>Choose your Telloya plan</legend>
              {telloyaPlans.map((plan) => {
                const selected = values.planTier === plan.tier
                const priceDisplay = plan.monthlyPriceGbp !== null
                  ? `${formatGbpPrice(plan.monthlyPriceGbp)}/month`
                  : "Contact for quotation"
                const minutesDisplay = plan.minutesPerMonth !== null
                  ? formatMinutes(plan.minutesPerMonth)
                  : "Tailored to your needs"
                return (
                  <label key={plan.tier} className={`${styles.option} ${selected ? styles.optionSelected : ""}`}>
                    <input
                      id={`${formId}-${plan.tier}`}
                      type="radio"
                      name="planTier"
                      value={plan.tier}
                      checked={selected}
                      onChange={() => update("planTier", plan.tier)}
                    />
                    <span className={styles.optionMark} aria-hidden="true">{selected && <Check size={14} />}</span>
                    <span>
                      <span className={styles.optionLabel}>
                        {plan.name}
                        {plan.popular && <span className={styles.optionBadge}>Recommended</span>}
                      </span>
                      <span className={styles.optionCopy}>{priceDisplay} • {minutesDisplay}</span>
                    </span>
                  </label>
                )
              })}
              {errors.planTier && <p className={styles.error}>{errors.planTier}</p>}
            </fieldset>

            {values.planTier && values.planTier !== "custom" && (
              <div className={styles.fields} style={{ marginTop: "2rem" }}>
                <label className={styles.check} htmlFor={`${formId}-guardInterested`}>
                  <input
                    id={`${formId}-guardInterested`}
                    type="checkbox"
                    checked={values.guardInterested}
                    onChange={(e) => update("guardInterested", e.target.checked)}
                  />
                  <span>
                    Add Relaunch Guard monitoring at {formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)}/location/month
                  </span>
                </label>
                {values.guardInterested && (
                  <Field id={`${formId}-guardLocationCount`} label="How many locations need Guard protection?" error={errors.guardLocationCount}>
                    <input
                      name="guardLocationCount"
                      type="number"
                      min="1"
                      value={values.guardLocationCount}
                      onChange={(e) => update("guardLocationCount", e.target.value)}
                      required
                    />
                  </Field>
                )}
              </div>
            )}

            {values.planTier === "custom" && (
              <div className={styles.fields} style={{ marginTop: "2rem" }}>
                <p className={styles.sectionNote}>Tell us about your requirements so we can prepare a tailored quotation</p>
                <div className={styles.twoCol}>
                  <Field id={`${formId}-customMonthlyMinutes`} label="Monthly minutes needed" error={errors.customMonthlyMinutes}>
                    <input
                      name="customMonthlyMinutes"
                      type="number"
                      min="1"
                      value={values.customMonthlyMinutes}
                      onChange={(e) => update("customMonthlyMinutes", e.target.value)}
                      placeholder="e.g., 1000"
                      required
                    />
                  </Field>
                  <Field id={`${formId}-customMonthlyCalls`} label="Expected calls per month" error={errors.customMonthlyCalls}>
                    <input
                      name="customMonthlyCalls"
                      type="number"
                      min="1"
                      value={values.customMonthlyCalls}
                      onChange={(e) => update("customMonthlyCalls", e.target.value)}
                      placeholder="e.g., 200"
                      required
                    />
                  </Field>
                </div>
                <div className={styles.twoCol}>
                  <Field id={`${formId}-customPhoneNumbers`} label="Phone numbers needed" error={errors.customPhoneNumbers}>
                    <input
                      name="customPhoneNumbers"
                      type="number"
                      min="1"
                      value={values.customPhoneNumbers}
                      onChange={(e) => update("customPhoneNumbers", e.target.value)}
                      placeholder="e.g., 3"
                      required
                    />
                  </Field>
                  <Field id={`${formId}-customLocations`} label="Number of locations" error={errors.customLocations}>
                    <input
                      name="customLocations"
                      type="number"
                      min="1"
                      value={values.customLocations}
                      onChange={(e) => update("customLocations", e.target.value)}
                      placeholder="e.g., 5"
                      required
                    />
                  </Field>
                </div>
                <Field id={`${formId}-customLanguages`} label="Languages required" optional error={errors.customLanguages}>
                  <input
                    name="customLanguages"
                    value={values.customLanguages}
                    onChange={(e) => update("customLanguages", e.target.value)}
                    maxLength={500}
                    placeholder="e.g., English, Spanish, French"
                  />
                </Field>
                <Field id={`${formId}-customRequirements`} label="Additional requirements" optional error={errors.customRequirements}>
                  <textarea
                    name="customRequirements"
                    value={values.customRequirements}
                    onChange={(e) => update("customRequirements", e.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Please describe any specific needs or integration requirements"
                  />
                </Field>
                <label className={styles.check} htmlFor={`${formId}-guardInterested-custom`}>
                  <input
                    id={`${formId}-guardInterested-custom`}
                    type="checkbox"
                    checked={values.guardInterested}
                    onChange={(e) => update("guardInterested", e.target.checked)}
                  />
                  <span>
                    Add Relaunch Guard monitoring at {formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)}/location/month
                  </span>
                </label>
                {values.guardInterested && (
                  <Field id={`${formId}-guardLocationCount-custom`} label="How many locations need Guard protection?" error={errors.guardLocationCount}>
                    <input
                      name="guardLocationCount"
                      type="number"
                      min="1"
                      value={values.guardLocationCount}
                      onChange={(e) => update("guardLocationCount", e.target.value)}
                      required
                    />
                  </Field>
                )}
              </div>
            )}
          </>
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

            <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #e5e7eb" }}>
              <p className={styles.sectionNote} style={{ marginBottom: "1.5rem" }}>Voice and language preferences (optional, subject to provider compatibility)</p>
              <div className={styles.twoCol}>
                <Field id={`${formId}-voicePreference`} label="Voice preference" optional error={errors.voicePreference}>
                  <select
                    name="voicePreference"
                    value={values.voicePreference}
                    onChange={(e) => update("voicePreference", e.target.value as VoicePreferenceChoice)}
                  >
                    <option value="">No preference</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="no-preference">No preference</option>
                  </select>
                </Field>
                <Field id={`${formId}-voiceAccent`} label="Preferred accent" optional error={errors.voiceAccent}>
                  <input
                    name="voiceAccent"
                    value={values.voiceAccent}
                    onChange={(e) => update("voiceAccent", e.target.value)}
                    maxLength={100}
                    placeholder="e.g., British, American"
                  />
                </Field>
              </div>
              <div className={styles.twoCol}>
                <Field id={`${formId}-primaryLanguage`} label="Primary language" optional error={errors.primaryLanguage}>
                  <input
                    name="primaryLanguage"
                    value={values.primaryLanguage}
                    onChange={(e) => update("primaryLanguage", e.target.value)}
                    maxLength={100}
                    placeholder="e.g., English"
                  />
                </Field>
                <Field id={`${formId}-speakingStyle`} label="Speaking style" optional error={errors.speakingStyle}>
                  <select
                    name="speakingStyle"
                    value={values.speakingStyle}
                    onChange={(e) => update("speakingStyle", e.target.value as SpeakingStyleChoice)}
                  >
                    <option value="">No preference</option>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="calm">Calm</option>
                    <option value="no-preference">No preference</option>
                  </select>
                </Field>
              </div>
              <Field id={`${formId}-additionalLanguages`} label="Additional languages" optional error={errors.additionalLanguages}>
                <input
                  name="additionalLanguages"
                  value={values.additionalLanguages}
                  onChange={(e) => update("additionalLanguages", e.target.value)}
                  maxLength={500}
                  placeholder="e.g., Spanish, French"
                />
              </Field>
            </div>

            <div style={{ marginTop: "2rem", paddingTop: "2rem", borderTop: "1px solid #e5e7eb" }}>
              <p className={styles.sectionNote} style={{ marginBottom: "1.5rem" }}>Additional minutes (optional)</p>
              <label className={styles.check} htmlFor={`${formId}-overageInterested`}>
                <input
                  id={`${formId}-overageInterested`}
                  type="checkbox"
                  checked={values.overageInterested}
                  onChange={(e) => update("overageInterested", e.target.checked)}
                />
                <span>
                  Interested in additional minutes at {formatGbpPrice(overagePolicy.pricePerMinuteGbp)}/minute if plan allowance exceeded
                </span>
              </label>
              {values.overageInterested && (
                <Field id={`${formId}-overageMonthlyCapGbp`} label="Proposed monthly cap (£)" optional error={errors.overageMonthlyCapGbp} hint="Maximum additional spend per month">
                  <input
                    name="overageMonthlyCapGbp"
                    type="number"
                    min="1"
                    step="0.01"
                    value={values.overageMonthlyCapGbp}
                    onChange={(e) => update("overageMonthlyCapGbp", e.target.value)}
                    placeholder="e.g., 50"
                  />
                </Field>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className={styles.reviewIntro}>
            <p className={styles.reviewIntro}>Check the details below before submitting your enquiry. You can go back and change anything that doesn&apos;t look right.</p>
            <p className={styles.sectionNote} style={{ marginTop: "0.75rem", marginBottom: "1.5rem" }}>Note: Submitting this enquiry does not authorize any charges or activate service. We will discuss pricing and next steps when we contact you.</p>
            <ReviewBlock title="Plan selection" onEdit={() => goToStep(1)}>
              <ReviewItem label="Plan" value={values.planTier ? telloyaPlans.find(p => p.tier === values.planTier)?.name || values.planTier : "Not selected"} />
              {values.guardInterested && (
                <ReviewItem label="Relaunch Guard" value={`Yes (${values.guardLocationCount || 0} locations)`} />
              )}
              {values.planTier === "custom" && (
                <>
                  <ReviewItem label="Monthly minutes" value={values.customMonthlyMinutes} />
                  <ReviewItem label="Monthly calls" value={values.customMonthlyCalls} />
                  <ReviewItem label="Phone numbers" value={values.customPhoneNumbers} />
                  <ReviewItem label="Locations" value={values.customLocations} />
                  {values.customLanguages && <ReviewItem label="Languages" value={values.customLanguages} />}
                  {values.customRequirements && <ReviewItem label="Additional requirements" value={values.customRequirements} wide />}
                </>
              )}
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
              {(values.voicePreference || values.voiceAccent || values.primaryLanguage || values.speakingStyle || values.additionalLanguages) && (
                <>
                  {values.voicePreference && <ReviewItem label="Voice preference" value={values.voicePreference} />}
                  {values.voiceAccent && <ReviewItem label="Accent" value={values.voiceAccent} />}
                  {values.primaryLanguage && <ReviewItem label="Primary language" value={values.primaryLanguage} />}
                  {values.speakingStyle && <ReviewItem label="Speaking style" value={values.speakingStyle} />}
                  {values.additionalLanguages && <ReviewItem label="Additional languages" value={values.additionalLanguages} />}
                </>
              )}
              {values.overageInterested && (
                <ReviewItem label="Additional minutes interest" value={values.overageMonthlyCapGbp ? `Yes (proposed cap: £${values.overageMonthlyCapGbp}/month)` : "Yes"} />
              )}
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
