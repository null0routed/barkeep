/**
 * "Generate Details" (Add Item dialog) response extraction (TODO.MD #4).
 *
 * Older versions demanded a very specific ```json fenced "loot" array shape and
 * threw away any response that deviated. Models drift; the dialog only needs a
 * handful of flat fields (name / description / rarity / quantity). This helper
 * tolerates fences, surrounding prose, a single item object, an array with a
 * first item, or one level of wrapper object ({loot: […]} etc.), and normalizes
 * what it finds. Pure and DOM-free so it is fully unit-testable.
 */

/** The item fields the Add Item dialog can actually show. All optional on return. */
export interface GeneratedItemFields {
  /** Display name of the item. */
  name?: string
  /** Short (1-3 sentence) description. */
  description?: string
  /** Rarity as returned by the model, lowercased — the caller validates against its UI list. */
  rarity?: string
  /** Positive whole-number quantity (inventory items only). */
  quantity?: number
}

/**
 * Scans for the first balanced `{…}` region in the text, reserving JSON string
 * literals (braces inside quotes, and escaped quotes, must not confuse the depth
 * count). Returns null when no balanced object is present.
 */
function firstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/**
 * Extracts usable item fields from a model response of any plausible shape.
 * Returns null when nothing usable is found (caller surfaces "didn't return
 * usable item details").
 */
export function extractItemFields(content: unknown): GeneratedItemFields | null {
  if (typeof content !== "string") return null

  const candidate = firstBalancedJsonObject(content)
  if (!candidate) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return null
  }

  // Unwrap: top-level array → first entry; one wrapper field (loot/items/item) → its first object
  let item: unknown = parsed
  if (Array.isArray(item)) item = item[0]
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const record = item as Record<string, unknown>
    for (const key of ["loot", "items", "item"]) {
      const value = record[key]
      if (Array.isArray(value) && value.length > 0) {
        item = value[0]
        break
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        item = value
        break
      }
    }
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) return null

  const record = item as Record<string, unknown>
  const fields: GeneratedItemFields = {}
  if (typeof record.name === "string" && record.name.trim()) fields.name = record.name.trim()
  if (typeof record.description === "string" && record.description.trim()) {
    fields.description = record.description.trim()
  }
  if (typeof record.rarity === "string" && record.rarity.trim()) {
    fields.rarity = record.rarity.trim().toLowerCase()
  }

  const rawQuantity = record.quantity
  const quantity =
    typeof rawQuantity === "number" ? rawQuantity : typeof rawQuantity === "string" && rawQuantity.trim() ? Number(rawQuantity) : NaN
  if (Number.isInteger(quantity) && quantity > 0) fields.quantity = quantity

  return fields.name || fields.description || fields.rarity || fields.quantity ? fields : null
}
