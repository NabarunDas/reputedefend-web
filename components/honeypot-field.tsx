"use client"

import { useId } from "react"

export function HoneypotField() {
  const id = useId()
  return (
    <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
      <label htmlFor={id}>Company fax</label>
      <input id={id} name="companyFax" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  )
}
