"use client"

export function HoneypotField() {
  return (
    <div aria-hidden="true" className="absolute top-0 left-0 h-0 w-0 overflow-hidden opacity-0">
      <label>
        Company fax
        <input name="companyFax" type="text" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  )
}
