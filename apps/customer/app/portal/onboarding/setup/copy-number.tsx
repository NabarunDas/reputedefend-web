"use client"

export function CopyForwardingNumber({ number }: { number: string }) {
  return (
    <button type="button" onClick={() => void navigator.clipboard?.writeText(number)}>
      Copy
    </button>
  )
}
