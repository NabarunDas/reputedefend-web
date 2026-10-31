"use client"

import { useEffect } from "react"

const SAFE_RESUME = /^\/pay\/return\?(?:order=SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}&)?resume=1$/

export function resumeSameOrigin(
  href: string,
  navigate: (next: string) => void = next => window.location.replace(next),
) {
  if (!SAFE_RESUME.test(href)) return
  try {
    navigate(href)
  } catch {
    // The Continue link is the same same-origin URL when navigation is unavailable.
  }
}

/** Second navigation is same-origin, so a Strict portal cookie is sent. */
export function PaymentReturnResumeNavigate({ href }: { href: string }) {
  useEffect(() => {
    resumeSameOrigin(href)
  }, [href])
  return null
}
