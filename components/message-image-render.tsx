"use client"

// The scene image is a fully dynamic, user-supplied source (a `data:` URL from the image
// API's `b64_json`, or an arbitrary provider `http(s)` URL). `next/image` cannot render
// data URLs and would force remote URLs through its optimizer for no benefit, so a raw
// `<img>` is the correct, owner-approved choice here (no new deps). We opt out of the
// Next lint rule that nudges toward `next/image` for this component only.
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { ImageOffIcon, Loader2Icon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getImage, type StoredImage } from "@/lib/image-store"

/**
 * Scene-image renderer for a chat bubble (TODO.MD #9.2).
 *
 * The `ChatMessage` only carries `{ id, alt }` — the image itself (a data URL or an http
 * URL) is stored by id in IndexedDB (lib/image-store.ts). This component fetches it by id,
 * shows a 720p-proportioned thumbnail centered in the bubble, and offers a full-size
 * lightbox (click to open; Esc / outside-click / ✕ to close; the backdrop is slightly
 * blurred). Every "no image" path degrades to an alt-text placeholder so a missing
 * IndexedDB record (cleared, private browsing, or a pre-image save) never breaks layout.
 */
interface MessageImageRenderProps {
  /** IndexedDB key of the stored image (from `ChatMessage.image.id`). */
  id: string
  /** Alt text (accessibility + the unavailable-state placeholder). */
  alt: string
}

type ImageState =
  | { status: "loading" }
  | { status: "ready"; src: string }
  | { status: "unavailable" }

const MessageImageRender = memo(({ id, alt }: MessageImageRenderProps) => {
  const [state, setState] = useState<ImageState>({ status: "loading" })
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Fetch the stored image by id. Runs after hydration (client); the initial state is
  // "loading" on both server and client, so there is no hydration mismatch. A not-found
  // / no-idb result resolves to "unavailable" (alt text) rather than an error.
  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })
    getImage(id).then((result) => {
      if (cancelled) return
      if (result.ok && result.value) {
        const value = result.value as StoredImage
        if (value.src) setState({ status: "ready", src: value.src })
        else setState({ status: "unavailable" })
      } else {
        setState({ status: "unavailable" })
      }
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Lightbox close on Escape + lock page scroll while it is open + focus
  // management (T4.4): focus moves to the ✕ on open (remembering where the user
  // was), back to it on close, and Tab/Shift+Tab stay on it — the ✕ is the only
  // focusable thing in the dialog, so a full trap is just "redirect to ✕".
  // (Client-only; the overlay is never rendered on the server.)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!lightboxOpen) return
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null
    closeButtonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false)
        return
      }
      if (e.key === "Tab") {
        e.preventDefault()
        closeButtonRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      const lastFocused = lastFocusedRef.current
      if (lastFocused && typeof document.contains === "function" && document.contains(lastFocused)) {
        lastFocused.focus()
      }
    }
  }, [lightboxOpen])

  const openLightbox = useCallback(() => setLightboxOpen(true), [])
  const closeLightbox = useCallback(() => setLightboxOpen(false), [])

  if (state.status === "ready") {
    return (
      <>
        <button
          type="button"
          onClick={openLightbox}
          className="mx-auto block w-[70%] max-w-md overflow-hidden rounded-md ring-1 ring-black/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-white/10"
          title="View scene image full-size"
          aria-label={`View image: ${alt}`}
        >
          <img
            src={state.src}
            alt={alt}
            className="block aspect-video w-full cursor-zoom-in object-cover"
          />
        </button>

        {lightboxOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Scene image: ${alt}`}
          >
            {/* Backdrop: click to close, slight blur (owner spec) */}
            <div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={closeLightbox}
            />
            <div className="relative z-10 max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg shadow-2xl">
              <img
                src={state.src}
                alt={alt}
                className="h-auto max-h-[88vh] w-auto max-w-[88vw]"
              />
            </div>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 z-20 bg-black/40 text-white hover:bg-black/60"
              onClick={closeLightbox}
              aria-label="Close image preview"
            >
              <XIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
      </>
    )
  }

  if (state.status === "unavailable") {
    return (
      <div className="mx-auto flex w-[70%] max-w-md items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <ImageOffIcon className="h-4 w-4 shrink-0" />
        <span className="line-clamp-2">
          {alt.trim() ? `Image unavailable: ${alt}` : "Image unavailable"}
        </span>
      </div>
    )
  }

  // Loading: a 16:9 placeholder with a spinner, reserving the thumbnail's footprint.
  return (
    <div className="mx-auto w-[70%] max-w-md overflow-hidden rounded-md border border-dashed text-muted-foreground">
      <div className="flex aspect-video w-full items-center justify-center">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    </div>
  )
})

MessageImageRender.displayName = "MessageImageRender"

export default MessageImageRender
