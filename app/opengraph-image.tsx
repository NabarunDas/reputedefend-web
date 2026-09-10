import { ImageResponse } from "next/og"
import { brandColors, ogCopy, ogImage } from "@/lib/brand"

export const alt = ogImage.alt
export const size = { width: ogImage.width, height: ogImage.height }
export const contentType = ogImage.contentType

export default function OpenGraphImage() {
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
          padding: "72px 80px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: -2.4,
            lineHeight: 1,
          }}
        >
          {ogCopy.name}
        </div>

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
