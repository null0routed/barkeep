/**
 * Name/description filtering for the character-sheet tabs (T5.1).
 *
 * The five unbounded tabs (Inventory, Equipment, Traits, Feats, Spells) can grow long
 * enough over a campaign that finding one entry by name becomes tedious. These are the
 * shared, testable predicates: case-insensitive substring matching, against `name` OR
 * `description` — so both "Mithral" (a name) and "silver cord" (a word in a
 * description) resolve, in a single predictable pass.
 *
 * All item shapes in lib/types.ts (InventoryItem, Equipment, Trait, Feat, Spell)
 * satisfy FilterableItem, so one generic covers every tab. Matching per-item also
 * means the tabs can render the ORIGINAL array (skipping non-matches) and keep the
 * true array indices that edit/delete handlers rely on.
 */

/** Minimum shape a filterable list entry needs: a name, plus a description when offered. */
export interface FilterableItem {
  name: string
  description?: string
}

/** True when `item` matches `query` — an empty/whitespace-only query matches everything. */
export function itemMatches(item: FilterableItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.name.toLowerCase().includes(q)) return true
  return (item.description ?? "").toLowerCase().includes(q)
}

/**
 * Filter `items` by `query` (name or description), preserving their order.
 * An empty/whitespace-only query returns `items` untouched — same reference, so
 * callers can detect "not filtering" without a second comparison.
 */
export function filterItems<T extends FilterableItem>(items: T[], query: string): T[] {
  if (!query.trim()) return items
  return items.filter((item) => itemMatches(item, query))
}
