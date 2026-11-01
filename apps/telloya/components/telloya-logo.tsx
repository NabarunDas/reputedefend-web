/**
 * Telloya Logo Component
 * 
 * Uses owner-approved emerald-glass logo featuring telephone handset, AI sparkle and orbital speech emblem.
 * 
 * Assets from: apps/telloya/public/brand/
 * - telloya-mark-approved.webp (697×697) — Glass emblem for dark surfaces
 * - telloya-logo-approved.webp (1961×580) — Full lockup for light backgrounds ONLY
 * 
 * CRITICAL: The dark-green full wordmark has LOW CONTRAST on dark backgrounds.
 * For dark surfaces, use the glass emblem with ivory-colored HTML text.
 */

import Image from "next/image"

export type TelloyaLogoVariant = "light" | "dark" | "symbol"

interface TelloyaLogoProps {
  variant?: TelloyaLogoVariant
  className?: string
  priority?: boolean
}

export function TelloyaLogo({ variant = "dark", className = "", priority = false }: TelloyaLogoProps) {
  if (variant === "symbol") {
    // Glass emblem for dark surfaces with HTML wordmark
    return (
      <div className={`telloya-logo-symbol ${className}`} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Image
          src="/brand/telloya-mark-approved.webp"
          alt=""
          width={32}
          height={32}
          priority={priority}
          style={{ display: "block" }}
        />
        <span style={{ 
          fontFamily: "var(--font-display), Arial, sans-serif",
          fontSize: "20px",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "#f7f8f3"
        }}>
          Telloya
        </span>
      </div>
    )
  }

  // Full approved logo - ONLY for light backgrounds
  return (
    <Image
      src="/brand/telloya-logo-approved.webp"
      alt="Telloya"
      width={160}
      height={47}
      priority={priority}
      className={`telloya-logo ${className}`}
      style={{ display: "block", height: "auto" }}
    />
  )
}
