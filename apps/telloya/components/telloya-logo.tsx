import { brandName } from "@/lib/brand"

/**
 * Temporary text-based Telloya wordmark component.
 *
 * This serves as the logo until the dedicated final Telloya SVG/PNG logo
 * is approved and available. The final logo will replace this component
 * and be served from public/brand/.
 *
 * Do not generate or commit an unapproved logo image.
 */
export function TelloyaLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-display), Arial, Helvetica, sans-serif",
        fontSize: "clamp(1.5rem, 4vw, 2rem)",
        fontWeight: 800,
        letterSpacing: "-0.03em",
        color: "var(--green)",
      }}
      aria-label={brandName}
    >
      {brandName}
    </span>
  )
}
