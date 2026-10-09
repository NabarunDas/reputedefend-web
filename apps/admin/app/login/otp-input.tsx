"use client"

import { useState, type RefObject } from "react"
import { ADMIN_OTP_DIGITS } from "@/lib/auth/otp"

/**
 * Cap the value after removing non-digits. A native maxLength of 8 would cut
 * a formatted paste such as "12 34-5678" before those characters are removed.
 */
export function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, ADMIN_OTP_DIGITS)
}

export function OtpInput({
  id,
  value,
  describedBy,
  onChange,
  inputRef,
}: {
  id: string
  value: string
  describedBy: string
  onChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const [focused, setFocused] = useState(false)
  const current = Math.min(value.length, ADMIN_OTP_DIGITS - 1)
  return (
    <div
      className="otp-field"
      onMouseDown={event => {
        if (event.target === inputRef.current) return
        event.preventDefault()
        inputRef.current?.focus()
      }}
    >
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
        pattern="[0-9]{8}"
        value={value}
        onChange={event => onChange(normalizeOtp(event.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        aria-describedby={describedBy}
      />
      <div className="otp-slots" aria-hidden="true">
        {Array.from({ length: ADMIN_OTP_DIGITS }, (_, index) => (
          <span key={index} className="otp-slot" data-otp-slot="" data-current={focused && index === current ? "true" : "false"}>
            {value[index] ?? ""}
          </span>
        ))}
      </div>
    </div>
  )
}
