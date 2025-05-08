import type { MetadataRoute } from "next"

// Add this line to fix the static export error
export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barkeep D&D Character Sheet",
    short_name: "Barkeep",
    description: "A comprehensive D&D character management system with AI assistance",
    start_url: "/",
    id: "/",
    icons: [
      {
        src: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/barkeep-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    theme_color: "#2D1600",
    background_color: "#2D1600",
    display: "standalone",
    orientation: "portrait",
    scope: "/",
  }
}
