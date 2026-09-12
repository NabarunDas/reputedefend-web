import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { brandAssets, brandColors, logoSize, ogCopy, ogImage } from "@/lib/brand"

export const alt = ogImage.alt
export const size = { width: ogImage.width, height: ogImage.height }
export const contentType = ogImage.contentType

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public", brandAssets.horizontal.light.replace(/^\//, "")))
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`
  const logoWidth = 560
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
          padding: "64px 80px",
        }}
      >
        <img src={logoSrc} width={logoWidth} height={logoHeight} alt="" />

        <div style={{ display: "flex", flexDirection: "column" }}>
          {ogCopy.headlineLines.map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                fontSize: 40,
                fontWeight: 650,
                letterSpacing: -0.7,
                lineHeight: 1.2,
                maxWidth: 920,
                color: brandColors.paper,
              }}
            >
              {line}
            </div>
          ))}
          <div
            style={{
              display: "flex",
              marginTop: 28,
              width: 48,
              height: 3,
              backgroundColor: brandColors.accent,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: brandColors.mist,
            letterSpacing: 0.12,
          }}
        >
          {ogCopy.support}
        </div>
      </div>
    ),
    { ...size },
  )
}
