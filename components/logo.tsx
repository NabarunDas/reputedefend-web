import Image from "next/image"
import { brandAssets, logoSize, markSize, type BrandVariant } from "@/lib/brand"

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
 * Temporary ReputeDefend wordmark / mark.
 *
 * Swap the files in public/brand when the approved logo is supplied.
 * Header and footer should keep importing ReputeLogo / ReputeMark.
 */
export function ReputeMark({
  variant = "dark",
  className,
  decorative = false,
  priority = false,
}: Omit<LogoProps, "markOnly">) {
  return (
    <Image
      src={brandAssets.mark[variant]}
      alt={decorative ? "" : "ReputeDefend mark"}
      width={markSize.width}
      height={markSize.height}
      className={className}
      unoptimized
      priority={priority}
    />
  )
}

export function ReputeLogo({
  variant = "dark",
  markOnly = false,
  className,
  decorative = false,
  priority = false,
}: LogoProps) {
  if (markOnly) {
    return (
      <ReputeMark
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
      alt={decorative ? "" : "ReputeDefend"}
      width={logoSize.width}
      height={logoSize.height}
      className={className}
      unoptimized
      priority={priority}
    />
  )
}
