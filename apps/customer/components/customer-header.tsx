"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { brandLogoDark, customerHeaderLogoSizes, logoSize, marketingHomeLabel, marketingOrigin } from "@/lib/brand"
import { reloadAuthenticatedDocument } from "@/lib/portal/account/document"

export function CustomerHeader({ accountName = null }: { accountName?: string | null }) {
  const pathname = usePathname()
  const portal = pathname === "/portal" || pathname.startsWith("/portal/")
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const update = () => setStuck(window.scrollY > 8)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) reloadAuthenticatedDocument()
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
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
            sizes={customerHeaderLogoSizes}
            className="customer-logo"
            priority
          />
        </a>
        {portal ? (
          <p className="customer-header-context" title={accountName && accountName !== "My account" ? accountName : undefined}>
            {accountName ?? "My account"}
          </p>
        ) : (
          <a className="customer-header-return" href={marketingOrigin}>Back to ProfileRelaunch</a>
        )}
      </div>
    </header>
  )
}
