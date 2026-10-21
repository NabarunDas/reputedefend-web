"use client"
import { useState } from "react"
import { standardScopeExclusions } from "../../../../lib/commercial/scope-templates"
import { customerPriceBoundary, customerPriceLine } from "../../../../lib/pricing"

/**
 * Standard scope and exclusions for a new draft. Edits stay in the form until
 * Restore is used. Restore does not call the quote command.
 */
export function ScopeExclusionsFields({ serviceCode }: { serviceCode: string }) {
  const initial = standardScopeExclusions(serviceCode)
  const [appliedCode, setAppliedCode] = useState(serviceCode)
  const [scope, setScope] = useState(initial?.scope ?? "")
  const [exclusions, setExclusions] = useState(initial?.exclusions ?? "")

  if (serviceCode !== appliedCode) {
    const previous = standardScopeExclusions(appliedCode)
    const untouched = previous
      ? scope === previous.scope && exclusions === previous.exclusions
      : scope === "" && exclusions === ""
    const next = standardScopeExclusions(serviceCode)
    setAppliedCode(serviceCode)
    if (untouched) {
      setScope(next?.scope ?? "")
      setExclusions(next?.exclusions ?? "")
    }
  }

  function restore() {
    const next = standardScopeExclusions(serviceCode)
    if (!next) return
    setScope(next.scope)
    setExclusions(next.exclusions)
  }

  return <>
    <p>Approved standard wording for the selected service is filled in below. You do not need to write that wording. Edit it only for this case. Restore standard wording puts the current approved template back into these fields. It does not change a saved quote or an accepted agreement. The customer wording is “{customerPriceLine}” “{customerPriceBoundary}”. This form does not add an amount on top of the published price and does not change the catalogue tax behaviour.</p>
    <label>Scope<textarea name="scope" required minLength={10} maxLength={5000} rows={6} value={scope} onChange={event => setScope(event.target.value)} /></label>
    <label>Exclusions<textarea name="exclusions" required minLength={10} maxLength={5000} rows={5} value={exclusions} onChange={event => setExclusions(event.target.value)} /></label>
    <button type="button" onClick={restore}>Restore standard wording</button>
  </>
}
