import type { Spell } from "./types"

/**
 * Order helpers for the character tab lists (TODO.MD #17) — pure functions so the
 * per-tab DnD/arrows glue stays thin and the semantics are unit-tested in one place.
 *
 * Order is simply the array order in CharacterData; the existing autosave persists
 * it, and sanitizeStoredCharacter passes saved arrays through untouched.
 */

/**
 * Return arr with the item at `from` moved to position `to` (splice semantics: the
 * removed slot collapses, then the item is inserted at `to`). Indices are clamped to
 * the array bounds; `from === to` (or an empty array) returns the SAME array instance,
 * so a no-op never re-renders. The input array is never mutated.
 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const length = arr.length
  if (length === 0) return arr
  const safeFrom = Math.max(0, Math.min(from, length - 1))
  const safeTo = Math.max(0, Math.min(to, length - 1))
  if (safeFrom === safeTo) return arr

  const next = arr.slice()
  const [moved] = next.splice(safeFrom, 1)
  next.splice(safeTo, 0, moved)
  return next
}

/** `to` for moveItem given a drop on row `targetIndex` with the pointer above/below its midpoint. */
export type DropEdge = "before" | "after"

/**
 * Insertion index (for moveItem) when dropping the item at `sourceIndex` onto the row
 * at `targetIndex`, `edge` side. Accounts for the slot collapse when the source sits
 * before the target — that is what keeps "before B" / "after B" true in the result.
 */
export function dropInsertIndex(sourceIndex: number, targetIndex: number, edge: DropEdge): number {
  if (edge === "after") {
    return sourceIndex < targetIndex ? targetIndex : targetIndex + 1
  }
  return sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
}

/**
 * Spells live in ONE array but are displayed grouped by level — reordering must stay
 * WITHIN the spell's level group (TODO.MD #17). Swaps the spell with its NEAREST
 * same-level neighbor in `direction` (other-level spells in between are skipped in the
 * scan); returns `null` at the group's edge so the tab can disable the arrow.
 */
export function swapSpellNeighbors(spells: Spell[], spellId: string, direction: "up" | "down"): Spell[] | null {
  const index = spells.findIndex((spell) => spell.id === spellId)
  if (index === -1) return null
  const spell = spells[index]!

  const step = direction === "up" ? -1 : 1
  let neighborIndex = index + step
  while (neighborIndex >= 0 && neighborIndex < spells.length && spells[neighborIndex]!.level !== spell.level) {
    neighborIndex += step
  }
  if (neighborIndex < 0 || neighborIndex >= spells.length) return null

  return moveItem(spells, index, neighborIndex)
}
