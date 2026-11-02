/**
 * Telloya's final owner-selected "Connected T" logo, 2026-11-02.
 * The image contains the exact 3D emerald-and-champagne-gold sculpted T
 * and the original approved wordmark; no substitute font or redrawing.
 *
 * Logo alternatives use the same exact glyphs on light/dark surfaces.
 * There is no rounded-square background button in the master design.
 */
import Image from "next/image"

export type TelloyaLogoVariant = "light" | "dark" | "symbol"

interface TelloyaLogoProps {
  variant?: TelloyaLogoVariant
  className?: string
  priority?: boolean
}

export function TelloyaLogo({ variant = "symbol", className = "", priority = false }: TelloyaLogoProps) {
  const src = variant === "dark"
    ? "/brand/telloya-connected-t-lockup-dark.webp"
    : "/brand/telloya-connected-t-lockup.webp"

  return (
    <span className={`telloya-logo-lockup ${className}`}>
      <Image
        src={src}
        alt="Telloya"
        width={1388}
        height={510}
        priority={priority}
        sizes="(max-width: 520px) 142px, 164px"
        style={{ display: "block", width: "100%", height: "auto", objectFit: "contain" }}
      />
    </span>
  )
}
