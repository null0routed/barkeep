"use client"

import { useState } from "react"
import SpriteIcon from "@/components/sprite-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Inline name filter for a character-sheet tab (T5.1): a ghost search sprite in the
 * tab's CardHeader that expands in place into a focused text input, kept alongside
 * the tab's "+ Add" button. Collapses on Escape or when cleared; the icon also
 * toggles it (and clears the query) — so phones, which have no handy Escape, still
 * have an obvious way back out. Shows "n of m" while filtering.
 *
 * The query itself stays in the tab component (its `visible*` list is derived from
 * it), so filtering re-renders only that one tab — and matches `lib/filter.ts`.
 */
interface TabFilterProps {
  /** What's being filtered — used for the placeholder and accessible names ("items", "spells", …). */
  noun: string
  query: string
  onQueryChange: (query: string) => void
  /** How many of `total` entries the current query matches (shown as "n of m"). */
  matched: number
  total: number
}

export default function TabFilter({ noun, query, onQueryChange, matched, total }: TabFilterProps) {
  const [open, setOpen] = useState(false)

  const collapse = (): void => {
    setOpen(false)
    onQueryChange("")
  }

  return (
    <div className="flex items-center gap-1.5">
      {open && (
        <>
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              const value = e.target.value
              onQueryChange(value)
              if (!value.trim()) collapse() // spec: clearing the field collapses the filter
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation()
                collapse()
              }
            }}
            placeholder={`Filter ${noun}…`}
            aria-label={`Filter ${noun}`}
            className="h-8 w-32 text-sm sm:w-44"
          />
          {query.trim() && (
            <span aria-live="polite" className="whitespace-nowrap text-xs text-muted-foreground">
              {matched} of {total}
            </span>
          )}
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={open ? `Hide ${noun} filter` : `Filter ${noun}`}
        title={open ? `Hide ${noun} filter` : `Filter ${noun} by name or description`}
        aria-pressed={open}
        onClick={() => (open ? collapse() : setOpen(true))}
      >
        <SpriteIcon name="action-search" s={0.2} />
      </Button>
    </div>
  )
}
