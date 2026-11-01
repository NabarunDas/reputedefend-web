/**
 * Telloya Logo Component
 * 
 * Uses approved emerald-glass logo featuring telephone handset, AI sparkle and orbital speech emblem.
 * 
 * Assets from: apps/telloya/public/brand/
 * - telloya-mark-approved.webp — Glass logo symbol for dark surfaces
 * - telloya-logo-approved.webp — Full logo for light surfaces
 * 
 * IMPORTANT: The dark-green full wordmark must NOT be placed on dark backgrounds
 * where it becomes unreadable. For dark surfaces, use the glass symbol with
 * ivory-colored HTML text.
 */

import Image from "next/image"

export type TelloyaLogoVariant = "light" | "dark" | "symbol"

interface TelloyaLogoProps {
  variant?: TelloyaLogoVariant
  className?: string
  priority?: boolean
}

export function TelloyaLogo({ variant = "light", className = "", priority = false }: TelloyaLogoProps) {
  if (variant === "symbol") {
    // Glass symbol for dark surfaces
    return (
      <div className={`telloya-logo-symbol ${className}`}>
        <Image
          src="/brand/telloya-mark-approved.webp"
          alt="Telloya"
          width={40}
          height={40}
          priority={priority}
          className="telloya-mark"
        />
        <span className="telloya-wordmark-light">Telloya</span>
      </div>
    )
  }

  if (variant === "dark") {
    // For light backgrounds - uses dark wordmark
    return (
      <Image
        src="/brand/telloya-logo-approved.webp"
        alt="Telloya"
        width={160}
        height={40}
        priority={priority}
        className={`telloya-logo ${className}`}
      />
    )
  }

  // Default: light variant for dark backgrounds
  return (
    <Image
      src="/brand/telloya-logo-approved.webp"
      alt="Telloya"
      width={160}
      height={40}
      priority={priority}
      className={`telloya-logo ${className}`}
    />
  )
}
