"use client"

import * as React from "react"
import SpriteIcon from "@/components/sprite-icon"

/**
 * An inline sprite badge with a click popover naming it (v1.2.0 owner
 * direction): the rarity bottle (inventory/equipment tabs) and the school
 * sprite (spells tab) communicate by art, not by word — clicking the badge
 * lifts a small popover with its name ("Legendary", "Evocation", …).
 *
 * Interaction: click toggles, Escape closes, any outside pointer-down closes
 * (multiple badges can sit in one row, so only one popover should survive an
 * outside click). The host is a real button — keyboard toggling and
 * focus-visible ring for free — and the sprite's direct-child placement means
 * it inherits the shared sprite-button glow language from globals.css.
 */
export default function SpriteLabel({
  sprite,
  s,
  label,
}: {
  sprite: string
  s: number
  label: string
}) {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex items-center">
      <button
        type="button"
        className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-expanded={open}
        aria-label={`Show ${label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <SpriteIcon name={sprite} s={s} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md"
        >
          {label}
          {/* tiny pointer notch under the bubble */}
          <span aria-hidden className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-border" />
        </span>
      )}
    </span>
  )
}
