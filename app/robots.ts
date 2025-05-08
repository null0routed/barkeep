import type { MetadataRoute } from "next"

// Add this line to fix the static export error
export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: null,
  }
}
