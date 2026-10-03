"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { brandLogoDark, logoSize, marketingHomeLabel, marketingOrigin } from "@/lib/brand"

export function CustomerHeader() {
  const pathname = usePathname()
  const portal = pathname === "/portal" || pathname.startsWith("/portal/")
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const update = () => setStuck(window.scrollY > 8)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  return (
    <header className={stuck ? "customer-header is-stuck" : "customer-header"}>
      <div className="customer-container customer-header-inner">
        <a className="customer-logo-link" href={marketingOrigin} aria-label={marketingHomeLabel}>
          <Image
            src={brandLogoDark}
            alt=""
            width={logoSize.width}
            height={logoSize.height}
            sizes="(max-width: 767px) 160px, 200px"
            className="customer-logo"
            priority
          />
        </a>
        {portal ? (
          <p className="customer-header-context">Secure customer area</p>
        ) : (
          <a className="customer-header-return" href={marketingOrigin}>Back to ProfileRelaunch</a>
        )}
      </div>
    </header>
  )
}
