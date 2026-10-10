"use client"

import { useState, type RefObject } from "react"
import { CUSTOMER_OTP_DIGITS, normalizeCustomerOtp } from "@/lib/otp"

export function OtpInput({
  id,
  value,
  describedBy,
  onChange,
  inputRef,
}: {
  id: string
  value: string
  describedBy?: string
  onChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const [focused, setFocused] = useState(false)
  const current = Math.min(value.length, CUSTOMER_OTP_DIGITS - 1)
  return (
    <div
      className="otp-field"
      onMouseDown={event => {
        if (event.target === inputRef.current) return
        event.preventDefault()
        inputRef.current?.focus()
      }}
    >
      {/* Native maxLength would truncate a formatted paste before non-digits are removed. */}
      <input
        ref={inputRef}
        id={id}
        name="code"
        className="otp-control"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        pattern={`[0-9]{${CUSTOMER_OTP_DIGITS}}`}
        aria-label="Eight-digit code"
        value={value}
        onChange={event => onChange(normalizeCustomerOtp(event.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        aria-describedby={describedBy}
      />
      <div className="otp-slots" aria-hidden="true">
        {Array.from({ length: CUSTOMER_OTP_DIGITS }, (_, index) => (
          <span key={index} className="otp-slot" data-otp-slot="" data-current={focused && index === current ? "true" : "false"}>
            {value[index] ?? ""}
          </span>
        ))}
      </div>
    </div>
  )
}
