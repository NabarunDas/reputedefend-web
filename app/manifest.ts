import type { MetadataRoute } from "next"
import { brandColors, brandDescription, brandName } from "@/lib/brand"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brandName,
    short_name: brandName,
    description: brandDescription,
    start_url: "/",
    display: "browser",
    background_color: brandColors.paper,
    theme_color: brandColors.green,
    icons: [
      {
        src: "/icon.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
