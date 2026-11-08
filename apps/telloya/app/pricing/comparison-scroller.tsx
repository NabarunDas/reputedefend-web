"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import styles from "./pricing.module.css"

const HINT_ID = "comparison-scroll-hint"

export function ComparisonScroller({ children }: { children: ReactNode }) {
  const regionRef = useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const region = regionRef.current
    if (!region) return

    const measure = () => {
      setOverflows(region.scrollWidth > region.clientWidth + 1)
    }

    measure()
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null
    observer?.observe(region)
    const table = region.querySelector("table")
    if (table) observer?.observe(table)
    window.addEventListener("resize", measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  return (
    <>
      <p id={HINT_ID} className={styles.scrollHint} data-visible={overflows ? "true" : "false"} hidden={!overflows}>
        Scroll sideways to compare all plans.
      </p>
      <div
        ref={regionRef}
        className={styles.tableContainer}
        tabIndex={0}
        role="region"
        aria-label="Telloya plan comparison"
        aria-describedby={overflows ? HINT_ID : undefined}
      >
        {children}
      </div>
    </>
  )
}
