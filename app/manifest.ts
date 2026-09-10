import type { MetadataRoute } from "next"
import { brandColors } from "@/lib/brand"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReputeDefend",
    short_name: "ReputeDefend",
    description: "Practical reputation support for businesses.",
    start_url: "/",
    display: "browser",
    background_color: brandColors.paper,
    theme_color: brandColors.green,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  }
}
