"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const delays = [2000, 4000, 8000, 16000]

/** A few quiet refreshes, then stop. The button remains if the customer wants another read. */
export function PaymentReturnRefresh() {
  const router = useRouter()
  useEffect(() => {
    let index = 0
    let timer = 0
    const tick = () => {
      if (index >= delays.length) return
      timer = window.setTimeout(() => {
        router.refresh()
        index += 1
        tick()
      }, delays[index])
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [router])
  return <button type="button" onClick={() => router.refresh()}>Refresh</button>
}
