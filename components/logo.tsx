import Image from "next/image"
import { brandAssets, brandName, logoSize, markSize, type BrandVariant } from "@/lib/brand"

type LogoProps = {
  variant?: BrandVariant
  markOnly?: boolean
  className?: string
  /**
   * Set when the logo sits inside a labelled home link so the image is not
   * announced twice.
   */
  decorative?: boolean
  priority?: boolean
  /**
   * Override only when the lockup is rendered wider than the header/footer
   * sizes; the defaults stop a 1932px source being requested for a ~200px slot.
   */
  sizes?: string
}

/** Header and footer cap the lockup near 230px; mobile scales with the viewport. */
const LOGO_SIZES = "(max-width: 640px) 50vw, 240px"
const MARK_SIZES = "(max-width: 640px) 48px, 64px"

/**
 * Approved ProfileRelaunch lockup / mark.
 *
 * Header and footer should keep importing BrandLogo / BrandMark.
 * Swap the files in public/brand if a vector original is supplied later.
 */
export function BrandMark({
  variant = "dark",
  className,
  decorative = false,
  priority = false,
  sizes = MARK_SIZES,
}: Omit<LogoProps, "markOnly">) {
  return (
    <Image
      src={brandAssets.mark[variant]}
      alt={decorative ? "" : `${brandName} mark`}
      width={markSize.width}
      height={markSize.height}
      className={className}
      sizes={sizes}
      priority={priority}
    />
  )
}

export function BrandLogo({
  variant = "dark",
  markOnly = false,
  className,
  decorative = false,
  priority = false,
  sizes,
}: LogoProps) {
  if (markOnly) {
    return (
      <BrandMark
        variant={variant}
        className={className}
        decorative={decorative}
        priority={priority}
        sizes={sizes}
      />
    )
  }

  return (
    <Image
      src={brandAssets.horizontal[variant]}
      alt={decorative ? "" : brandName}
      width={logoSize.width}
      height={logoSize.height}
      className={className}
      sizes={sizes ?? LOGO_SIZES}
      priority={priority}
    />
  )
}
