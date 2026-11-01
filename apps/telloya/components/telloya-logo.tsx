import { brandName } from "@/lib/brand"

/**
 * Temporary text-based Telloya wordmark component.
 *
 * This serves as the logo until the dedicated final Telloya SVG/PNG logo
 * is approved and available. The final logo will replace this component
 * and be served from public/brand/.
 *
 * Supports light and dark variants for accessible contrast:
 * - Dark variant for light backgrounds (header)
 * - Light variant for dark backgrounds (footer)
 *
 * Do not generate or commit an unapproved logo image.
 */

type LogoVariant = "dark" | "light"

export function TelloyaLogo({ 
  className = "", 
  variant = "dark" 
}: { 
  className?: string
  variant?: LogoVariant 
}) {
  const color = variant === "light" ? "var(--lime)" : "var(--green)"
  
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-display), Arial, Helvetica, sans-serif",
        fontSize: "clamp(1.5rem, 4vw, 2rem)",
        fontWeight: 800,
        letterSpacing: "-0.03em",
        color,
      }}
      aria-label={brandName}
    >
      {brandName}
    </span>
  )
}
