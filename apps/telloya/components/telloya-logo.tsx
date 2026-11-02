/**
 * Telloya brand lockup — owner-approved sage-glass button and amber-gold
 * headset/chat emblem (2026-11-02). Keep the wordmark as accessible HTML.
 * The image already includes its rounded glass tile and needs no CSS frame.
 */
import Image from "next/image"

export type TelloyaLogoVariant = "light" | "dark" | "symbol"

interface TelloyaLogoProps {
  variant?: TelloyaLogoVariant
  className?: string
  priority?: boolean
}

export function TelloyaLogo({ variant = "symbol", className = "", priority = false }: TelloyaLogoProps) {
  return (
    <span className={`telloya-logo-symbol ${className}`} style={{ display: "inline-flex", alignItems: "center", gap: "12px" }}>
      <Image
        src="/brand/telloya-amber-glass-icon.webp"
        alt=""
        width={48}
        height={48}
        priority={priority}
        sizes="48px"
        style={{ display: "block", flexShrink: 0 }}
      />
      <span style={{
        fontFamily: "var(--font-display), Arial, sans-serif",
        fontSize: "20px",
        fontWeight: 800,
        letterSpacing: "-0.02em",
        color: variant === "light" ? "#082e24" : "#f7f8f3",
      }}>
        Telloya
      </span>
    </span>
  )
}
