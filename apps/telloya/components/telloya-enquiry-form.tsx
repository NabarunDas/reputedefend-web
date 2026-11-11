"use client"

import Link from "next/link"
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactElement, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Mail } from "lucide-react"
import styles from "./telloya-enquiry-form.module.css"
import type { TelloyaEnquiryRequest, TelloyaEnquiryResponse, TelloyaEnquiryCapabilities } from "@/lib/enquiry-contract"
import { legalIdentity } from "@/lib/legal"
import { telloyaPlans, relaunchGuardAddon, overagePolicy, calculateCombinedPrice, formatGbpPrice, formatMinutes, commercialCopy, type TelloyaPlanTier } from "@/lib/pricing"
import { sendTelloyaLeadConversion } from "@/lib/analytics"

type PlanTierInterest = TelloyaPlanTier | ""
type EnquiryPathway = "advice" | "detailed"
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
  receptionistQuestions: string
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
  receptionistQuestions: "",
  privacyAccepted: false,
}

type EnquiryFieldErrors = Partial<Record<keyof EnquiryValues, string>>

function strictWholeNumber(value: string | undefined, min: number, max: number): number | undefined | "invalid" {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return undefined
  if (!/^\d+$/.test(trimmed)) return "invalid"
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return "invalid"
  return parsed
}

function strictAmount(value: string | undefined, min: number, max: number): number | undefined | "invalid" {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) return undefined
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return "invalid"
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return "invalid"
  return parsed
}

const DETAILED_ERROR_FIELDS = [
  "planTier",
  "guardLocationCount",
  "customMonthlyMinutes",
  "customMonthlyCalls",
  "customPhoneNumbers",
  "customLocations",
  "customLanguages",
  "customRequirements",
  "overageMonthlyCapGbp",
] as const

const OPTIONAL_FIELDS = new Set<string>([
  "phoneSetup",
  "missedCallProblem",
  "voicePreference",
  "voiceAccent",
  "primaryLanguage",
  "speakingStyle",
  "additionalLanguages",
  "contactPreference",
  "websiteUrl",
  "locations",
  "overageInterested",
  "overageMonthlyCapGbp",
])

const STEP_TITLES = {
  1: "Your service",
  2: "Your business and contact details",
} as const

const RECEPTIONIST_QUESTIONS_HINT = "Describe the questions, business information or enquiry details you would like covered in the demonstration. We'll discuss them with you before preparing it."

export function TelloyaEnquiryForm({ 
  capabilities, 
  initialPlanTier = "", 
  initialGuardInterested = false,
  initialRequestIntent = "",
}: { 
  capabilities?: TelloyaEnquiryCapabilities; 
  initialPlanTier?: PlanTierInterest;
  initialGuardInterested?: boolean;
  initialRequestIntent?: "personalised-demo" | "";
}) {
  const submissionEnabled = capabilities?.submissionEnabled ?? false
  const requestIntent = initialRequestIntent === "personalised-demo" ? "personalised-demo" : ""
  const [step, setStep] = useState<1 | 2>(1)
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [pathway, setPathway] = useState<EnquiryPathway>(initialPlanTier || initialGuardInterested ? "detailed" : "advice")
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
  const submittingRef = useRef(false)
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

  function selectPathway(next: EnquiryPathway) {
    setPathway(next)
    if (next === "advice") {
      setErrors((current) => {
        const cleared = { ...current }
        for (const field of DETAILED_ERROR_FIELDS) delete cleared[field]
        return cleared
      })
    }
  }

  function validateStep(nextStep: 1 | 2): EnquiryFieldErrors {
    const stepErrors: EnquiryFieldErrors = {}
    const advising = pathway === "advice"

    if (nextStep >= 1 && !advising) {
      if (!values.planTier) {
        stepErrors.planTier = "Please select a plan."
      }

      if (values.guardInterested) {
        const guardCount = strictWholeNumber(values.guardLocationCount, 1, 999)
        if (guardCount === undefined) stepErrors.guardLocationCount = "Please enter the number of locations."
        else if (guardCount === "invalid") stepErrors.guardLocationCount = "Please enter a whole number between 1 and 999."
      }

      if (values.planTier === "custom") {
        const minutes = strictWholeNumber(values.customMonthlyMinutes, 1, 1000000)
        if (minutes === undefined) stepErrors.customMonthlyMinutes = "Please enter monthly minutes required."
        else if (minutes === "invalid") stepErrors.customMonthlyMinutes = "Please enter a whole number between 1 and 1,000,000."

        const calls = strictWholeNumber(values.customMonthlyCalls, 1, 100000)
        if (calls === "invalid") stepErrors.customMonthlyCalls = "Please enter a whole number between 1 and 100,000."

        const phones = strictWholeNumber(values.customPhoneNumbers, 1, 999)
        if (phones === undefined) stepErrors.customPhoneNumbers = "Please enter the number of phone numbers."
        else if (phones === "invalid") stepErrors.customPhoneNumbers = "Please enter a whole number between 1 and 999."

        const locs = strictWholeNumber(values.customLocations, 1, 9999)
        if (locs === undefined) stepErrors.customLocations = "Please enter the number of locations."
        else if (locs === "invalid") stepErrors.customLocations = "Please enter a whole number between 1 and 9,999."
      }
    }

    if (nextStep >= 2) {
      if (!values.businessName) stepErrors.businessName = "Please enter your business name."
      if (!values.country) stepErrors.country = "Please enter your country."
      if (!values.trade) stepErrors.trade = "Please describe your trade or service."
      if (!values.fullName) stepErrors.fullName = "Please enter your name."
      if (!values.email || !/^\S+@\S+\.\S+$/.test(values.email)) stepErrors.email = "Please enter a valid email address."
      if (!values.phone || !/^[+]?[\d\s().-]{7,}$/.test(values.phone)) stepErrors.phone = "Please enter a valid phone number."
      if (!values.privacyAccepted) stepErrors.privacyAccepted = "Please confirm you have read the privacy notice."
      if (values.receptionistQuestions.trim().length > 2000) {
        stepErrors.receptionistQuestions = "Please keep this within 2,000 characters."
      }
      if (!advising && values.overageInterested) {
        const cap = strictAmount(values.overageMonthlyCapGbp, 1, 100000)
        if (cap === undefined) stepErrors.overageMonthlyCapGbp = "Please enter a monthly spending cap."
        else if (cap === "invalid") stepErrors.overageMonthlyCapGbp = "Please enter an amount between £1 and £100,000."
      }
    }

    return stepErrors
  }

  function continueToNext(event?: MouseEvent<HTMLButtonElement>) {
    // Cancel the click before the step change. Otherwise React can reuse this
    // button node, switch it to type="submit", and the same click submits.
    event?.preventDefault()
    const stepErrors = validateStep(1)
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
    setStep(2)
    requestFocus("heading")
  }

  function goBack() {
    setStep(1)
    requestFocus("heading")
  }

  function goToStep(targetStep: 1 | 2) {
    setErrors({})
    setDeliveryError(false)
    setStatusText("")
    setStep(targetStep)
    requestFocus("heading")
  }

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return
    if (step < 2) {
      continueToNext()
      return
    }

    const allErrors = validateStep(2)
    if (Object.keys(allErrors).length) {
      setErrors(allErrors)
      if (allErrors.overageMonthlyCapGbp) setOptionalOpen(true)
      setDeliveryError(false)
      setStatusText("Please correct the highlighted fields before submitting.")
      requestFocus("summary")
      return
    }

    const advising = pathway === "advice"
    const guardLocationCount = !advising && values.guardInterested ? strictWholeNumber(values.guardLocationCount, 1, 999) : undefined
    const customMonthlyMinutes = !advising && values.planTier === "custom" ? strictWholeNumber(values.customMonthlyMinutes, 1, 1000000) : undefined
    const customMonthlyCalls = !advising && values.planTier === "custom" ? strictWholeNumber(values.customMonthlyCalls, 1, 100000) : undefined
    const customPhoneNumbers = !advising && values.planTier === "custom" ? strictWholeNumber(values.customPhoneNumbers, 1, 999) : undefined
    const customLocations = !advising && values.planTier === "custom" ? strictWholeNumber(values.customLocations, 1, 9999) : undefined
    const overageMonthlyCapGbp = !advising && values.overageInterested ? strictAmount(values.overageMonthlyCapGbp, 1, 100000) : undefined
    const numericErrors: EnquiryFieldErrors = {}
    if (guardLocationCount === "invalid") numericErrors.guardLocationCount = "Please enter a whole number between 1 and 999."
    if (customMonthlyMinutes === "invalid") numericErrors.customMonthlyMinutes = "Please enter a whole number between 1 and 1,000,000."
    if (customMonthlyCalls === "invalid") numericErrors.customMonthlyCalls = "Please enter a whole number between 1 and 100,000."
    if (customPhoneNumbers === "invalid") numericErrors.customPhoneNumbers = "Please enter a whole number between 1 and 999."
    if (customLocations === "invalid") numericErrors.customLocations = "Please enter a whole number between 1 and 9,999."
    if (overageMonthlyCapGbp === "invalid") numericErrors.overageMonthlyCapGbp = "Please enter an amount between £1 and £100,000."
    if (
      guardLocationCount === "invalid"
      || customMonthlyMinutes === "invalid"
      || customMonthlyCalls === "invalid"
      || customPhoneNumbers === "invalid"
      || customLocations === "invalid"
      || overageMonthlyCapGbp === "invalid"
    ) {
      setErrors(numericErrors)
      if (numericErrors.overageMonthlyCapGbp) setOptionalOpen(true)
      setDeliveryError(false)
      setStatus("idle")
      setStatusText("Please correct the highlighted fields before submitting.")
      requestFocus("summary")
      return
    }

    submittingRef.current = true
    let persisted = false
    setStatus("loading")
    setDeliveryError(false)
    setStatusText("Submitting your enquiry.")

    // Create payload to check if it has changed. Inactive conditional numbers are omitted.
    const payload: TelloyaEnquiryRequest = {
      product: advising ? "telloya" : values.product || "telloya",
      ...(advising ? {} : { planTier: values.planTier }),
      guardInterested: advising ? false : values.guardInterested,
      guardLocationCount,
      customMonthlyMinutes,
      customMonthlyCalls,
      customPhoneNumbers,
      customLocations,
      customLanguages: !advising && values.planTier === "custom" ? values.customLanguages || undefined : undefined,
      customRequirements: !advising && values.planTier === "custom" ? values.customRequirements || undefined : undefined,
      voicePreference: values.voicePreference || undefined,
      voiceAccent: values.voiceAccent || undefined,
      primaryLanguage: values.primaryLanguage || undefined,
      speakingStyle: values.speakingStyle || undefined,
      additionalLanguages: values.additionalLanguages || undefined,
      overageInterested: advising ? false : values.overageInterested,
      overageMonthlyCapGbp,
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
      receptionistQuestions: values.receptionistQuestions.trim() || undefined,
      ...(requestIntent ? { requestIntent } : {}),
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
      receptionistQuestions: payload.receptionistQuestions,
      requestIntent: payload.requestIntent,
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
          persisted = true
          setEnquiryRef(json.enquiryRef)
          setReceiptEmailStatus(json.receiptEmailStatus || "")
          setStatus("success")
          setStatusText("Your enquiry has been received.")
          if (json.leadConversion === true) {
            sendTelloyaLeadConversion({
              planTier: advising ? undefined : values.planTier,
              guardInterested: advising ? false : values.guardInterested,
            })
          }
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
        if (json.errors.overageMonthlyCapGbp) setOptionalOpen(true)
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
    } finally {
      if (!persisted) submittingRef.current = false
    }
  }

  if (status === "success") {
    const emailStatusMessage = receiptEmailStatus === "sent"
      ? "We've sent a confirmation email for your enquiry. Please check your inbox and, if needed, your spam folder. This does not confirm the message has arrived in your inbox."
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
        {requestIntent === "personalised-demo" ? (
          <>
            <p className={styles.successBody}>
              Thank you for your enquiry. We&apos;ll review your requirements and contact you to arrange a time for you to call our demonstration number.
            </p>
            <p className={styles.successNote}>
              This enquiry is not a confirmed demonstration booking. No payment is taken, no subscription is activated, and no demonstration agent is provisioned automatically. No payment details are required, and there is no obligation to subscribe.
            </p>
          </>
        ) : (
          <p className={styles.successBody}>
            Our team will review your enquiry and get in touch using the details you provided.
          </p>
        )}
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
        <h2 className={styles.prelaunchTitle}>Online enquiry submission is being prepared</h2>
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

  const selectedPlan = telloyaPlans.find((plan) => plan.tier === values.planTier)
  const guardLocations = strictWholeNumber(values.guardLocationCount, 1, 999)
  const indicativeMonthlyTotal = selectedPlan?.monthlyPriceGbp != null && values.guardInterested && typeof guardLocations === "number"
    ? calculateCombinedPrice(selectedPlan.monthlyPriceGbp, guardLocations)
    : null

  return (
    <form className={styles.form} onSubmit={submitEnquiry} noValidate aria-busy={status === "loading"}>
      <div className={styles.progress}>
        <p className={styles.progressLabel} id={`${formId}-progress`}>Step {step} of 2</p>
        <div className={styles.progressTrack} role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-labelledby={`${formId}-progress`}>
          <span style={{ width: `${(step / 2) * 100}%` }} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>{STEP_TITLES[step]}</h2>
      </div>

      {requestIntent === "personalised-demo" && (
        <p className={styles.sectionNote} role="note">
          You are requesting a personalised live demonstration. We will review your requirements, then contact you to arrange a suitable time and give you our demonstration telephone number. Submitting this form is not a confirmed appointment. No payment details are required, and there is no obligation to subscribe.
        </p>
      )}

      {showSummary && (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={styles.summary}>
          {deliveryError && <p>{statusText}</p>}
          {errorEntries.length > 0 && (
            <>
              <p>Please correct the following:</p>
              <ul>
                {errorEntries.map(([field, message]) => (
                  <li key={field}>
                    <button
                      type="button"
                      onClick={() => {
                        const focus = () => document.getElementById(`${formId}-${field}`)?.focus()
                        if (OPTIONAL_FIELDS.has(field)) {
                          setOptionalOpen(true)
                          window.setTimeout(focus, 0)
                          return
                        }
                        focus()
                      }}
                    >
                      {message}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className={styles.panel}>
        {step === 1 && (
          <div className={styles.fields}>
            <fieldset className={styles.options}>
              <legend className={styles.visuallyHidden}>How would you like to enquire?</legend>
              <label className={`${styles.option} ${pathway === "advice" ? styles.optionSelected : ""}`}>
                <input
                  id={`${formId}-pathway-advice`}
                  type="radio"
                  name="enquiryPathway"
                  value="advice"
                  checked={pathway === "advice"}
                  onChange={() => selectPathway("advice")}
                />
                <span className={styles.optionMark} aria-hidden="true">{pathway === "advice" && <Check size={14} />}</span>
                <span>
                  <span className={styles.optionLabel}>Help me choose a plan</span>
                  <span className={styles.optionCopy}>I&apos;m interested in Telloya. Help me find the right package for my business.</span>
                </span>
              </label>
              <label className={`${styles.option} ${pathway === "detailed" ? styles.optionSelected : ""}`}>
                <input
                  id={`${formId}-pathway-detailed`}
                  type="radio"
                  name="enquiryPathway"
                  value="detailed"
                  checked={pathway === "detailed"}
                  onChange={() => selectPathway("detailed")}
                />
                <span className={styles.optionMark} aria-hidden="true">{pathway === "detailed" && <Check size={14} />}</span>
                <span>
                  <span className={styles.optionLabel}>I know what I need</span>
                  <span className={styles.optionCopy}>I&apos;d like to select my plan and provide my setup requirements.</span>
                </span>
              </label>
            </fieldset>
            {pathway === "advice" && (
              <p className={styles.sectionNote}>
                We&apos;ll help you work out which Telloya plan suits your business, including your greeting, questions and the details you want collected. You don&apos;t need to know your monthly call minutes yet.
              </p>
            )}
            {pathway === "detailed" && (
            <>
            <div className={styles.fields}>
              <p className={styles.sectionNote}>
                Choose the plan that best matches your expected monthly call minutes. Need more locations, receptionist numbers or a different allowance? Choose Custom. You can <Link href="/pricing">compare the plans</Link> before deciding.
              </p>
            <fieldset
              id={`${formId}-planTier`}
              tabIndex={-1}
              className={styles.options}
              aria-invalid={errors.planTier ? true : undefined}
              aria-describedby={errors.planTier ? `${formId}-planTier-error` : undefined}
            >
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
              {errors.planTier && <p id={`${formId}-planTier-error`} className={styles.error}>{errors.planTier}</p>}
            </fieldset>
            </div>

            {selectedPlan && selectedPlan.monthlyPriceGbp != null && selectedPlan.minutesPerMonth != null && (
              <div className={styles.planCallout}>
                <p className={styles.sectionNote}>
                  {selectedPlan.name} is {formatGbpPrice(selectedPlan.monthlyPriceGbp)} per month and includes {formatMinutes(selectedPlan.minutesPerMonth)}. {commercialCopy.standardEntitlement} {commercialCopy.extraReceptionist} We&apos;ll confirm pricing and compatibility with you before you decide whether to proceed.
                </p>
              </div>
            )}
            {values.planTier === "custom" && (
              <div className={styles.planCallout}>
                <p className={styles.sectionNote}>
                  Custom is quoted individually for requirements outside the standard plans. Enter your best estimate of the monthly minutes, receptionist numbers and operating locations you need. We&apos;ll confirm the final requirements before preparing a quotation.
                </p>
              </div>
            )}

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
                <p className={styles.sectionNote}>{commercialCopy.guardPriceBasis} {commercialCopy.guardOnly} Selecting Guard records interest only.</p>
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
                {indicativeMonthlyTotal && selectedPlan?.monthlyPriceGbp != null && (
                  <p className={styles.sectionNote}>
                    Indicative monthly total: {formatGbpPrice(indicativeMonthlyTotal)} ({selectedPlan.name} {formatGbpPrice(selectedPlan.monthlyPriceGbp)} + Guard {formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} × {Number(values.guardLocationCount)}). {commercialCopy.guardOnly} This estimate is not a final approved offer and does not authorise billing. Guard interest is not a purchase.
                  </p>
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
                  <Field id={`${formId}-customMonthlyCalls`} label="Expected calls per month" optional error={errors.customMonthlyCalls}>
                    <input
                      name="customMonthlyCalls"
                      type="number"
                      min="1"
                      value={values.customMonthlyCalls}
                      onChange={(e) => update("customMonthlyCalls", e.target.value)}
                      placeholder="e.g., 200"
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
                <Field id={`${formId}-customLanguages`} label="Language preferences" optional error={errors.customLanguages} hint="A request only. Available languages depend on the voice provider.">
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
                    placeholder="For a more complex greeting, question flow or setup than the standard plans include"
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
                <p className={styles.sectionNote}>{commercialCopy.guardPriceBasis} {commercialCopy.guardOnly} Selecting Guard records interest only.</p>
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
                {values.guardInterested && typeof guardLocations === "number" && (
                  <p className={styles.sectionNote}>
                    Indicative Guard amount: {formatGbpPrice(Math.round(relaunchGuardAddon.pricePerLocationGbp * guardLocations * 100) / 100)} ({formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} × {guardLocations} locations). {commercialCopy.guardOnly} This is separate from the custom quotation, is not a final approved offer, and does not authorise billing.
                  </p>
                )}
              </div>
            )}
            </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.fields}>
            <ReviewBlock title="Your service" onEdit={() => goToStep(1)}>
              {pathway === "advice" ? (
                <ReviewItem label="Plan" value="Help me choose" />
              ) : (
                <>
                  <ReviewItem label="Plan" value={selectedPlan?.name || "Not selected"} />
                  {selectedPlan?.monthlyPriceGbp != null && (
                    <ReviewItem label="Price" value={`${formatGbpPrice(selectedPlan.monthlyPriceGbp)} per month, indicative`} />
                  )}
                  {selectedPlan?.minutesPerMonth != null && (
                    <ReviewItem label="Included minutes" value={formatMinutes(selectedPlan.minutesPerMonth)} />
                  )}
                  {values.guardInterested && (
                    <ReviewItem label="Relaunch Guard" value={`Yes (${values.guardLocationCount || 0} locations)`} />
                  )}
                  {indicativeMonthlyTotal != null && (
                    <ReviewItem label="Indicative monthly total" value={`${formatGbpPrice(indicativeMonthlyTotal)} estimate, not a charge`} />
                  )}
                  {values.planTier === "custom" && (
                    <>
                      <ReviewItem label="Monthly minutes" value={values.customMonthlyMinutes} />
                      <ReviewItem label="Monthly calls" value={values.customMonthlyCalls} />
                      <ReviewItem label="Phone numbers" value={values.customPhoneNumbers} />
                      <ReviewItem label="Locations" value={values.customLocations} />
                    </>
                  )}
                </>
              )}
            </ReviewBlock>

            <p className={styles.sectionNote}>
              {pathway === "advice"
                ? "Our team will discuss your requirements and help you choose a suitable plan."
                : "Review your selected plan, then provide your business and contact details so we can discuss the next steps."}
            </p>

            <Field id={`${formId}-businessName`} label="Business name" error={errors.businessName}>
              <input name="businessName" value={values.businessName} onChange={(e) => update("businessName", e.target.value)} maxLength={160} autoComplete="organization" required />
            </Field>
            <div className={styles.twoCol}>
              <Field id={`${formId}-country`} label="Country" error={errors.country}>
                <input name="country" value={values.country} onChange={(e) => update("country", e.target.value)} maxLength={80} autoComplete="country-name" required />
              </Field>
              <Field id={`${formId}-trade`} label="Business type or trade" error={errors.trade}>
                <input name="trade" value={values.trade} onChange={(e) => update("trade", e.target.value)} maxLength={100} required />
              </Field>
            </div>
            <Field id={`${formId}-fullName`} label="Contact name" error={errors.fullName}>
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
            <Field
              id={`${formId}-receptionistQuestions`}
              label="What would you like your receptionist to ask?"
              optional
              error={errors.receptionistQuestions}
              hint={RECEPTIONIST_QUESTIONS_HINT}
            >
              <textarea
                name="receptionistQuestions"
                value={values.receptionistQuestions}
                onChange={(e) => update("receptionistQuestions", e.target.value)}
                maxLength={2000}
                rows={4}
              />
            </Field>
            <button
              type="button"
              className={styles.optionalToggle}
              aria-expanded={optionalOpen}
              aria-controls={`${formId}-optional`}
              onClick={() => setOptionalOpen((open) => !open)}
            >
              {optionalOpen ? "Hide optional details" : "Optional details"}
            </button>
            {optionalOpen && (
            <div id={`${formId}-optional`} className={styles.optionalPanel}>
            <Field id={`${formId}-phoneSetup`} label="Your current phone setup" optional error={errors.phoneSetup} hint="e.g., mobile, landline, VoIP provider">
              <input name="phoneSetup" value={values.phoneSetup} onChange={(e) => update("phoneSetup", e.target.value)} maxLength={200} />
            </Field>
            <Field id={`${formId}-missedCallProblem`} label="Tell us about your missed-call challenge" optional error={errors.missedCallProblem}>
              <textarea name="missedCallProblem" value={values.missedCallProblem} onChange={(e) => update("missedCallProblem", e.target.value)} maxLength={500} rows={4} />
            </Field>
            <p className={styles.sectionNote}>{commercialCopy.voicePreference} {commercialCopy.voiceProvider}</p>
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
            <Field id={`${formId}-contactPreference`} label="Best time to contact you" optional error={errors.contactPreference}>
              <input name="contactPreference" value={values.contactPreference} onChange={(e) => update("contactPreference", e.target.value)} maxLength={100} placeholder="e.g., Weekday mornings" />
            </Field>
            <Field id={`${formId}-websiteUrl`} label="Business website URL" optional error={errors.websiteUrl}>
              <input name="websiteUrl" type="url" value={values.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} maxLength={1000} placeholder="https://www.example.com" />
            </Field>
            <Field id={`${formId}-locations`} label="Number of locations" optional error={errors.locations} hint="Optional description of your business. A standard plan still includes one operating location. This field does not add receptionist locations.">
              <input name="locations" value={values.locations} onChange={(e) => update("locations", e.target.value)} maxLength={50} />
            </Field>
            {pathway === "detailed" && <div>
              <label className={styles.check} htmlFor={`${formId}-overageInterested`}>
                <input
                  id={`${formId}-overageInterested`}
                  type="checkbox"
                  checked={values.overageInterested}
                  onChange={(e) => update("overageInterested", e.target.checked)}
                />
                <span>
                  Interested in additional minutes at {formatGbpPrice(overagePolicy.pricePerMinuteGbp)}/minute if the plan allowance is exceeded. Interest is not authorisation to charge. A customer-defined monthly spending cap is required before any overage can be agreed.
                </span>
              </label>
              {values.overageInterested && (
                <Field id={`${formId}-overageMonthlyCapGbp`} label="Proposed monthly cap (£)" error={errors.overageMonthlyCapGbp} hint="Required when you are interested in additional minutes. This does not authorise billing.">
                  <input
                    name="overageMonthlyCapGbp"
                    type="number"
                    min="1"
                    step="0.01"
                    value={values.overageMonthlyCapGbp}
                    onChange={(e) => update("overageMonthlyCapGbp", e.target.value)}
                    placeholder="e.g., 50"
                    required
                  />
                </Field>
              )}
            </div>}
            </div>
            )}

            <label className={styles.check} htmlFor={`${formId}-privacyAccepted`}>
              <input
                id={`${formId}-privacyAccepted`}
                name="privacyAccepted"
                type="checkbox"
                checked={values.privacyAccepted}
                aria-invalid={errors.privacyAccepted ? true : undefined}
                aria-describedby={errors.privacyAccepted ? `${formId}-privacyAccepted-error` : undefined}
                onChange={(e) => update("privacyAccepted", e.target.checked)}
              />
              <span>
                I understand how Telloya handles this information, as described in the{" "}
                <Link href="/privacy">privacy notice</Link>.
              </span>
            </label>
            {errors.privacyAccepted && <p id={`${formId}-privacyAccepted-error`} className={styles.error}>{errors.privacyAccepted}</p>}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {step > 1 ? (
          <button type="button" className={styles.back} onClick={goBack} disabled={status === "loading"}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
        ) : <span />}
        {step < 2 ? (
          <button key="continue" type="button" className={styles.next} onClick={continueToNext}>
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button key="submit" type="submit" className={styles.next} disabled={status === "loading"}>
            {status === "loading" ? "Submitting…" : "Submit enquiry"}
          </button>
        )}
      </div>

      {step === 2 && (
        <p className={styles.submitNote}>We will contact you to discuss your requirements. Submitting this enquiry does not take payment, activate the service, or authorise a recurring charge.</p>
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
        <button type="button" onClick={onEdit} aria-label={`Edit ${title}`}>Edit</button>
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
