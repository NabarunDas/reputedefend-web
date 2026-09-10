import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { brandColors, logoSize, ogCopy, ogImage } from "@/lib/brand"

export const alt = ogImage.alt
export const size = { width: ogImage.width, height: ogImage.height }
export const contentType = ogImage.contentType

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/logo-horizontal-light.png"))
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`
  const logoWidth = 520
  const logoHeight = Math.round((logoWidth * logoSize.height) / logoSize.width)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: brandColors.forest,
          color: brandColors.paper,
          padding: "64px 80px 64px",
        }}
      >
        <img src={logoSrc} width={logoWidth} height={logoHeight} alt="" />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 38,
              fontWeight: 600,
              letterSpacing: -0.6,
              lineHeight: 1.28,
              maxWidth: 920,
              color: brandColors.paper,
            }}
          >
            {ogCopy.headline}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              width: 56,
              height: 4,
              backgroundColor: brandColors.lime,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: brandColors.mist,
            letterSpacing: 0.15,
          }}
        >
          {ogCopy.support}
        </div>
      </div>
    ),
    { ...size },
  )
}
