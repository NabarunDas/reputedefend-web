"use client"
import { useRef, useState, type FormEvent } from "react"
import { evidenceTypeLabels, purchaserTypeChoices, type PurchaserType } from "@/lib/commercial/purchaser"

/**
 * The same purchaser form on Step 6, the case commercial page, and the
 * business record. It does not infer the country from a Google listing.
 */
export function PurchaserForm({
  businessId,
  businessName,
  customerName,
  listingCountry,
}: {
  businessId: string
  businessName: string
  customerName?: string | null
  listingCountry?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState("")
  const [purchaserType, setPurchaserType] = useState<PurchaserType>("LIMITED_COMPANY")
  const [countryChoice, setCountryChoice] = useState("")
  const key = useRef<string | null>(null)
  const evidenceTypes = purchaserType === "LIMITED_COMPANY"
    ? ["OTHER", "COMPANIES_HOUSE", "REGISTRY_EXTRACT"]
    : purchaserType === "OTHER"
      ? ["OTHER", "REGISTRY_EXTRACT", "ACCOUNTANT_CONFIRMED"]
      : ["OTHER", "ACCOUNTANT_CONFIRMED"]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || done || uncertain) return
    const form = new FormData(event.currentTarget)
    const outcome = String(form.get("outcome") || "")
    const otherCountry = String(form.get("otherCountry") || "").trim().toUpperCase()
    const countryCode = countryChoice === "GB" ? "GB" : countryChoice === "OTHER" ? otherCountry : ""
    key.current ||= crypto.randomUUID()
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/operations/business-establishment", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key.current },
        body: JSON.stringify({
          businessId,
          purchaserType,
          countryCode,
          subdivisionCode: String(form.get("subdivisionCode") || ""),
          legalName: form.get("legalName"),
          evidenceType: form.get("evidenceType"),
          evidenceReference: form.get("evidenceReference"),
          registrationId: form.get("registrationId"),
          taxId: form.get("taxId"),
          outcome,
          confirmed: form.get("confirmed") === "yes",
        }),
      })
      const result = await response.json() as { message?: string }
      setMessage(result.message || "The purchasing establishment could not be confirmed.")
      if (response.ok) setDone(true)
      else if (response.status >= 500 || response.status === 409) setUncertain(true)
      else key.current = null
    } catch {
      setMessage("Uncertain result. Reload before trying again.")
      setUncertain(true)
    } finally {
      setBusy(false)
    }
  }

  return <form className="record-form" onSubmit={submit}>
    <h3>Purchasing establishment</h3>
    <p>
      Record the legal purchaser for this business. Use the name already on the business record when it is the legal name.
      The Google listing is not this record. Companies House is optional and is not required for a sole trader or an individual.
      Saving a note does not verify the purchaser. Verifying it needs a fresh admin sign-in from the last five minutes and a real check.
      This does not offer the quote, take a payment, or send email.
    </p>
    {customerName ? <p>Customer on this case: {customerName}. Use that name only when that person is the purchaser.</p> : null}
    {listingCountry ? <p>The Google listing country on this case is {listingCountry}. It is not the purchasing establishment.</p> : null}
    <fieldset disabled={busy || done || uncertain}>
      <label>Legal purchasing name
        <input name="legalName" defaultValue={businessName} required minLength={2} maxLength={200} />
      </label>
      <label>Purchaser
        <select name="purchaserType" value={purchaserType} onChange={event => setPurchaserType(event.target.value as PurchaserType)}>
          {purchaserTypeChoices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select>
      </label>
      <label>Purchasing country
        <select name="countryChoice" value={countryChoice} onChange={event => setCountryChoice(event.target.value)} required>
          <option value="">Choose the purchasing country</option>
          <option value="GB">United Kingdom</option>
          <option value="OTHER">Another country, for review</option>
        </select>
      </label>
      {countryChoice === "OTHER" && <label>Two-letter country code
        <input name="otherCountry" required minLength={2} maxLength={2} autoComplete="off" />
      </label>}
      {(countryChoice === "OTHER") && <label>State or province, when the country needs one
        <input name="subdivisionCode" maxLength={6} autoComplete="off" />
      </label>}
      <label>Evidence checked
        <select name="evidenceType" defaultValue="OTHER" key={purchaserType}>
          {evidenceTypes.map(type => <option key={type} value={type}>{evidenceTypeLabels[type]}</option>)}
        </select>
      </label>
      <label>Registration number, if you already have one
        <input name="registrationId" maxLength={64} />
      </label>
      <p className="muted">Leave the registration number blank for a sole trader or an individual. Companies House is not required.</p>
      <label>Tax identifier, only if you already hold one
        <input name="taxId" maxLength={64} />
      </label>
      <p className="muted">Leave this blank when you do not have one. It does not charge tax and it does not change the advertised price.</p>
      <label>What you checked, or what is still missing
        <textarea name="evidenceReference" required minLength={20} maxLength={450} rows={3} />
      </label>
      <label>Verification
        <select name="outcome" defaultValue="pending">
          <option value="pending">Not yet verified</option>
          <option value="verified">Verified from a real check</option>
          <option value="rejected">Not sufficient</option>
        </select>
      </label>
      <label className="checkbox">
        <input type="checkbox" name="confirmed" value="yes" />
        I checked the genuine purchasing establishment and have supporting evidence.
      </label>
      <button type="submit">{busy ? "Saving…" : "Save purchaser record"}</button>
    </fieldset>
    {message ? <p role="status">{message}</p> : null}
    {(done || uncertain) && <button className="secondary" type="button" onClick={() => window.location.reload()}>Reload this page</button>}
  </form>
}
