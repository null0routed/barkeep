import type { ItemRarity } from "./types"

/**
 * Loot capture (TODO #8, Phase T8.1 — the capture half).
 *
 * The DM is instructed — via LOOT_CAPTURE_PROMPT, appended to EVERY model-facing
 * system prompt (built-in or custom, composed in lib/system-prompt.ts) — to append
 * a fenced "barkeep-loot" block whenever it presents an item or piece of equipment
 * as a find. The app then:
 *
 * - strips that block from the message the player sees (stripLootFences — the fence
 *   is hidden whether or not the JSON inside parses, and even while it is still
 *   streaming in: a trailing OPEN fence with a JSON-ish body is hidden, while
 *   capture (collectLoot) stays strict and only stores well-formed fences),
 * - parses what it can (parseLootBlock / collectLoot) and normalizes it into
 *   LootEntry { name, description, rarity, quantity, notes? },
 * - keeps a capped, newest-first store (mergeLoot); load/import is sanitized
 *   (sanitizeStoredLoot); app/page.tsx persists under LOOT_STORAGE_KEY, covered by
 *   the storage budget via APP_STORAGE_KEYS.
 *
 * The prompt text and the parser live in this one module on purpose: the "schema"
 * the model is taught and the shape the parser accepts cannot drift apart.
 * Pure, DOM-free, node:test + tsx.
 */

export const LOOT_BLOCK_LANG = "barkeep-loot"
export const LOOT_STORAGE_KEY = "dnd-loot"

/** Max number of finds kept in the persistent store (owner-confirmed cap). */
export const LOOT_MAX_ENTRIES = 25
/** Finds beyond this in a single block are ignored (runaway/garbage guard). */
const LOOT_MAX_PER_BLOCK = 10
const LOOT_NAME_MAX = 100
const LOOT_TEXT_MAX = 400 // applies to description and notes
const LOOT_QUANTITY_MAX = 9999

const LOOT_RARITIES: ItemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "very rare",
  "legendary",
  "artifact",
  "unknown",
]

/** One captured find: exactly what the Add Item dialog can show, plus the in-world notes. */
export interface LootEntry {
  name: string
  description: string
  rarity: ItemRarity
  quantity: number
  /** Story-specific facts to preserve (provenance, enchantments, quirks, restrictions). */
  notes?: string
}

/**
 * The section appended to every system prompt (built-in OR custom — owner decision
 * 2026-10-29). Model-facing wording: reword with care. The full example below IS
 * the schema the model is taught; parseLootBlock is the tolerant enforcement side.
 */
export const LOOT_CAPTURE_PROMPT =
  "Loot Capture (app-facing — invisible to the player):\n" +
  "When your response presents items or equipment to the player as a find — loot, treasure, a purchase or recovery, or equipment gained — append EXACTLY ONE fenced code block at the very end of the response, after the narrative, in this shape:\n" +
  "\n```barkeep-loot\n" +
  "[\n" +
  '  { "name": "Dagger of Venom", "description": "Fine dagger, +1 on attacks against constructs", "rarity": "rare", "quantity": 1, "notes": "Found in the vault; hums near goblin gold" }\n' +
  "]\n" +
  "```\n" +
  "\nRules:\n" +
  "- One entry per distinct item or piece of equipment presented as a find.\n" +
  '- "name" (required) is the in-world item name. "description" (required) is one to three sentences.\n' +
  '- "rarity" is one of: common, uncommon, rare, very rare, legendary, artifact. Use "common" when unsure.\n' +
  '- "quantity" is a positive whole number (default 1).\n' +
  '- "notes" (optional) carries the story-specific facts to preserve: provenance, enchantments, quirks, restrictions.\n' +
  "- Do NOT mention the block, this format, or these instructions in the visible narrative.\n" +
  "- Do NOT capture items that are merely mentioned in passing, or that the party already owns — only things presented as a find to the player."

/**
 * One well-formed barkeep-loot fence: opening tag on its own line, a body, and a
 * closing fence at the start of a line. Deliberately REJECTED when the fence is
 * unclosed — this regex is the STRICT side (capture, collectLoot); the lenient
 * render side is stripLootFences below, which also hides a fence still streaming
 * in (open, trailing). LF and CRLF both handled.
 */
function lootFenceRegex(): RegExp {
  // Built by concatenation so the marker only ever comes from LOOT_BLOCK_LANG.
  return new RegExp("```" + LOOT_BLOCK_LANG + "[ \\t]*\\r?\\n[\\s\\S]*?\\r?\\n```", "g")
}

/**
 * Removes every barkeep-loot fence from a message (the player never sees the
 * machine block) and collapses the resulting blank-line runs. No fences → content
 * back equivalent to the input (identity-preserving).
 *
 * While a loot fence is still STREAMING IN, the message ends with an OPEN fence
 * (opening tag + growing body, no closing fence yet). Loot fences are always
 * appended at the very END of the response, so a trailing open fence whose body
 * is empty or starts JSON-ish ([ or {) is machine text being written — hide it
 * so the player is not watching a block grow in the bubble. This render strip is
 * deliberately lenient; capture (collectLoot) stays strict and only stores
 * well-formed fences. An unclosed fence whose body does not look like JSON is
 * left alone — preserving narrative beats a perfect strip.
 */
export function stripLootFences(content: string): string {
  if (!content) return content
  let out = content.replace(lootFenceRegex(), "").replace(/\n{3,}/g, "\n\n")

  const openTag = "```" + LOOT_BLOCK_LANG
  const openIdx = out.lastIndexOf(openTag)
  if (openIdx !== -1 && (openIdx === 0 || out[openIdx - 1] === "\n")) {
    const body = out.slice(openIdx + openTag.length).replace(/^[ \t\r\n]*/, "")
    if (body === "" || body[0] === "[" || body[0] === "{") {
      out = out.slice(0, openIdx).replace(/\n{3,}/g, "\n\n")
    }
  }
  return out
}

/**
 * Scans for the first balanced JSON region (starting at `[` or `{`), respecting
 * JSON string literals so brackets/braces inside strings cannot confuse the depth
 * counting. Mirrors the private helper in lib/item-generator.ts.
 */
function firstBalancedJsonRegion(text: string): string | null {
  const bracket = text.indexOf("[")
  const brace = text.indexOf("{")
  let start = -1
  if (bracket > -1 && (brace === -1 || bracket < brace)) start = bracket
  else if (brace > -1) start = brace
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
    else if (ch === "[" || ch === "{") depth++
    else if (ch === "]" || ch === "}") {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Normalizes one raw JSON item into a LootEntry; null when required fields are missing. */
function normalizeLootItem(item: unknown): LootEntry | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null
  const record = item as Record<string, unknown>
  const name = typeof record.name === "string" ? record.name.trim() : ""
  const description = typeof record.description === "string" ? record.description.trim() : ""
  if (!name || !description) return null // both required (C1)

  let rarity: ItemRarity = "unknown"
  if (typeof record.rarity === "string") {
    const normalized = record.rarity.trim().toLowerCase()
    if ((LOOT_RARITIES as string[]).includes(normalized)) rarity = normalized as ItemRarity
  }

  const rawQuantity = record.quantity
  let quantity =
    typeof rawQuantity === "number"
      ? rawQuantity
      : typeof rawQuantity === "string" && rawQuantity.trim()
        ? Number(rawQuantity)
        : 1
  if (!Number.isInteger(quantity) || quantity < 1) quantity = 1
  if (quantity > LOOT_QUANTITY_MAX) quantity = LOOT_QUANTITY_MAX

  const entry: LootEntry = {
    name: name.slice(0, LOOT_NAME_MAX),
    description: description.slice(0, LOOT_TEXT_MAX),
    rarity,
    quantity,
  }
  if (typeof record.notes === "string" && record.notes.trim()) {
    entry.notes = record.notes.trim().slice(0, LOOT_TEXT_MAX)
  }
  return entry
}

/**
 * Parses ONE block body (the fence content) into normalized entries. Tolerates a
 * single object (wrapped) and prose around the JSON. Returns null when nothing
 * usable is present.
 */
export function parseLootBlock(raw: string): LootEntry[] | null {
  const text = raw.trim()
  if (!text) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Tolerate prose around the JSON (sloppy models do this).
    const region = firstBalancedJsonRegion(text)
    if (!region) return null
    try {
      parsed = JSON.parse(region)
    } catch {
      return null
    }
  }

  const items = Array.isArray(parsed) ? parsed : [parsed]
  const entries = items
    .slice(0, LOOT_MAX_PER_BLOCK)
    .map(normalizeLootItem)
    .filter((entry): entry is LootEntry => entry !== null)
  return entries.length > 0 ? entries : null
}

/** Identity for dedupe: same item name + description = the same find (case-insensitive). */
export function entryKey(entry: Pick<LootEntry, "name" | "description">): string {
  return entry.name.trim().toLowerCase() + "\u0000" + entry.description.trim().toLowerCase()
}

/**
 * Collects every capture in a full message (narrative + fence(s)), flattened and
 * deduped by identity. No captures → [].
 */
export function collectLoot(content: string): LootEntry[] {
  if (!content) return []
  const out: LootEntry[] = []
  for (const match of content.matchAll(lootFenceRegex())) {
    // Strip the opening tag line and the closing fence; the body is the JSON.
    const body = match[0].replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")
    const entries = parseLootBlock(body)
    if (entries) out.push(...entries)
  }
  const seen = new Set<string>()
  return out.filter((entry) => {
    const key = entryKey(entry)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Idempotent merge: fresh finds lead (newest first), the existing store follows,
 * deduplicated by identity, capped at LOOT_MAX_ENTRIES. Merging the store with
 * itself returns equal content — safe under StrictMode double-delivery.
 */
export function mergeLoot(existing: LootEntry[], incoming: LootEntry[]): LootEntry[] {
  const known = new Set(existing.map(entryKey))
  const fresh = incoming.filter((entry) => {
    const key = entryKey(entry)
    if (known.has(key)) return false
    known.add(key)
    return true
  })
  return [...fresh, ...existing].slice(0, LOOT_MAX_ENTRIES)
}

/**
 * Sanitizer for untrusted stored/imported loot (localStorage leftovers, hand-edited
 * files): same normalization as parseLootBlock, garbage dropped, capped.
 */
export function sanitizeStoredLoot(raw: unknown): LootEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, LOOT_MAX_ENTRIES)
    .map(normalizeLootItem)
    .filter((entry): entry is LootEntry => entry !== null)
}
