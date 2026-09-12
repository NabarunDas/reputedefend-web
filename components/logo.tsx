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
}

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
}: Omit<LogoProps, "markOnly">) {
  return (
    <Image
      src={brandAssets.mark[variant]}
      alt={decorative ? "" : `${brandName} mark`}
      width={markSize.width}
      height={markSize.height}
      className={className}
      unoptimized
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
}: LogoProps) {
  if (markOnly) {
    return (
      <BrandMark
        variant={variant}
        className={className}
        decorative={decorative}
        priority={priority}
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
      unoptimized
      priority={priority}
    />
  )
}
