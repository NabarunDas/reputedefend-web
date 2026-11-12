import type { EnquiryPayload } from "@/lib/enquiries/model"

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  growth: "Growth",
  pro: "Pro",
  custom: "Custom",
}

function provided(value: string | number | undefined | null) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return <>
    <dt>{label}</dt>
    <dd>{value}{note && <span className="muted"> {note}</span>}</dd>
  </>
}

export function TelloyaEnquiryInterest({ payload, enquiryRef }: { payload: EnquiryPayload; enquiryRef: string | null }) {
  if (payload.source !== "telloya") return null
  const plan = provided(payload.planTier).toLowerCase()
  const planLabel = PLAN_LABELS[plan] ?? (plan ? plan : "Plan to be confirmed")
  const guardCount = typeof payload.guardLocationCount === "number" ? payload.guardLocationCount : null
  const optional = [
    ["Current phone setup", provided(payload.phoneSetup)],
    ["Missed-call requirements", provided(payload.missedCallProblem)],
    ["Preferred voice", provided(payload.voicePreference)],
    ["Preferred accent", provided(payload.voiceAccent)],
    ["Primary language", provided(payload.primaryLanguage)],
    ["Speaking style", provided(payload.speakingStyle)],
    ["Additional languages", provided(payload.additionalLanguages)],
    ["Best contact time", provided(payload.contactPreference)],
    ["Website", provided(payload.websiteUrl)],
    ["Location note", provided(payload.locations)],
  ] as const

  return <section className="panel" aria-labelledby="telloya-interest-title">
    <h2 id="telloya-interest-title">Telloya enquiry interest</h2>
    <p>These details are what the customer asked for. They do not approve an offer, take payment, start Stripe, activate a live agent, or start Guard monitoring.</p>
    <dl>
      <Row label="Enquiry reference" value={enquiryRef || "Not recorded"} />
      <Row
        label="Request"
        value={payload.requestIntent === "personalised-demo" ? "Personalised live demonstration" : "General enquiry"}
        note={payload.requestIntent === "personalised-demo"
          ? "The customer asked for a personalised demonstration. This is not a confirmed booking and it does not provision an agent."
          : "No personalised-demonstration request was recorded."}
      />
      <Row label="Selected plan" value={planLabel} note={plan ? "Customer interest only. This is not an approved offer and it is not a subscription." : "No plan was selected. This is not an approved offer and it is not a subscription."} />
      <Row
        label="Product field"
        value={payload.product === "complete"
          ? "Legacy Complete interest"
          : payload.product === "telloya"
            ? "Telloya"
            : provided(payload.product) || "Not recorded"}
        note={payload.product === "complete"
          ? "Historical product interest. This is not a recorded purchase."
          : "Guard interest does not change this into the Complete bundle."}
      />
      <Row
        label="Relaunch Guard interest"
        value={payload.guardInterested
          ? `Yes${guardCount ? `, ${guardCount} location${guardCount === 1 ? "" : "s"} requested` : ""}`
          : "No Guard interest recorded"}
        note="This is not a Guard purchase. Admin confirms the paid location count when preparing the offer."
      />
      {plan === "custom" && <>
        <Row label="Quotation minutes" value={provided(payload.customMonthlyMinutes) || "Not recorded"} note="Required for a Custom quotation." />
        <Row label="Quotation calls" value={provided(payload.customMonthlyCalls) || "Not provided"} note="Optional." />
        <Row label="Quotation phone numbers" value={provided(payload.customPhoneNumbers) || "Not recorded"} note="Required for a Custom quotation." />
        <Row label="Quotation locations" value={provided(payload.customLocations) || "Not recorded"} note="Required for a Custom quotation." />
        <Row label="Quotation languages" value={provided(payload.customLanguages) || "Not provided"} note="Optional." />
        <Row label="Quotation notes" value={provided(payload.customRequirements) || "Not provided"} note="Optional." />
      </>}
      <Row
        label="Additional minutes"
        value={payload.overageInterested
          ? `Interested${payload.overageMonthlyCapGbp ? `, proposed cap £${payload.overageMonthlyCapGbp} per month` : ""}`
          : "No overage interest recorded"}
        note="A proposed cap does not authorise overage billing."
      />
      <Row label="Privacy acknowledgement" value={payload.privacyAccepted ? "Acknowledged" : "Not acknowledged"} note="Required before the enquiry can be stored." />
    </dl>
    <h3>Optional details</h3>
    <dl>
      <Row
        label="Receptionist questions"
        value={provided(payload.receptionistQuestions) || "Not provided"}
        note="Optional. This does not book a demonstration or provision an agent."
      />
      {optional.map(([label, value]) => <Row key={label} label={label} value={value || "Not provided"} note="Optional." />)}
    </dl>
  </section>
}
