import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Cinzel } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
// Display face for app-chrome headings (h1–h3, see globals.css). Variable font — the
// full weight axis loads, so `font-bold` panel titles need no extra requests.
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" })

export const metadata: Metadata = {
  title: "Barkeep",
  description: "A comprehensive D&D character management system with AI assistance",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
}

/**
 * themeColor belongs in the viewport export under Next 15 (in the metadata export it
 * emits a build warning on every route) — TODO.MD #6.
 */
export const viewport: Viewport = {
  // Matches the dark --background (hsl 26 20% 8%) — mobile browser chrome reads as
  // part of the app (Candlelit Tavern palette, 2026-11-07).
  themeColor: "#181410",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${inter.variable} ${cinzel.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
