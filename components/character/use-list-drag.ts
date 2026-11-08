"use client"
import type React from "react"
import { useCallback, useState } from "react"

/** Which side of a target row a drop would land on ("before" its top / "after" its bottom). */
export type DropEdge = "before" | "after"

/**
 * Grip-DnD state for ONE character-tab list (TODO.MD #17): which row (array index) is
 * being dragged, plus the hovered drop slot used for the insertion indicator. The tab
 * owns the actual move (it knows which array and which setCharacter); this hook only
 * tracks the drag.
 *
 * Index-based on purpose: every tab renders the ORIGINAL array and skips filter
 * non-matches (T5.1), so the row's `index` is its true array index even while
 * filtering — and items like InventoryItem/Equipment have no id field (no type
 * migration needed). The array cannot change mid-drag (moves happen only on drop),
 * so the captured index stays valid through the drag.
 *
 * Deliberately minimal and mouse-pointer centric: touch users get the arrows
 * (ReorderControls) instead of the grip — HTML5 DnD has no touch support.
 */
export function useListDrag() {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropSlot, setDropSlot] = useState<{ index: number; edge: DropEdge } | null>(null)

  const clearDrag = useCallback(() => {
    setDragIndex(null)
    setDropSlot(null)
  }, [])

  // Called by the draggable grip. `setDragImage` on the whole row (the rows carry
  // data-reorder-row) so the drag preview is the card, not just the grip glyph.
  const startDrag = useCallback((event: React.DragEvent, index: number) => {
    event.dataTransfer.effectAllowed = "move"
    const row = (event.target as HTMLElement).closest("[data-reorder-row]")
    if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 0, 0)
    setDragIndex(index)
  }, [])

  // Each row is a potential drop target: accept drops and report which half of it the
  // pointer is in (above midpoint = "before" the row, below = "after" it).
  const rowDragOver = useCallback(
    (event: React.DragEvent, index: number) => {
      if (dragIndex === null || dragIndex === index) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"
      const rect = event.currentTarget.getBoundingClientRect()
      const edge: DropEdge = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
      setDropSlot((current) => (current?.index === index && current.edge === edge ? current : { index, edge }))
    },
    [dragIndex],
  )

  // True for the row + edge that should show the insertion indicator right now.
  const isDropIndex = useCallback(
    (index: number, edge: DropEdge): boolean => dropSlot?.index === index && dropSlot.edge === edge,
    [dropSlot],
  )

  return { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex }
}
