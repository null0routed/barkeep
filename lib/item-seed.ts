/**
 * Context seeding for the Add Item "Generate Details" button (TODO.MD #8, Phase T8.2).
 *
 * When the DM has already presented an item in the campaign, Generate Details should
 * return THAT in-world item's details, not generic canonical ones. The model still
 * does the writing — this module only decides what context to seed (and with what
 * strength) and composes the final request. Stages, in priority order:
 *
 * 1. EXACT name match (word order, punctuation, and filler words insensitive) →
 *    the captured entry is seeded as canonical lore ("do not contradict").
 * 2. FUZZY CANDIDATES (token containment/overlap, top 3) → a "MAY be the same item"
 *    list; the MODEL makes the final "same item?" adjudication. String scores alone
 *    cannot distinguish "ring of bone" ⊂ "a ring of pale, almost translucent bone"
 *    (same item) from "dagger" ⊂ "dagger of venom" (different item) — the model can.
 * 3. BOUNDED RECENT CHAT (whole turns, narrative only: no loot fences, no inline
 *    thinking).
 * 4. NO CONTEXT → plain canonical prompt (today's behavior, system-neutral).
 *
 * App-authored wording is game-system NEUTRAL (owner revision, 2026-10-30): the
 * campaign's game system is carried by its DM prompt (player-authored custom when
 * set, else the built-in default — resolved by the CALLER via resolveSystemPrompt;
 * buildSystemMessageBase must never be passed here, so the loot-capture section is
 * never in the generator context).
 *
 * Pure, DOM-free, node:test + tsx.
 */

import type { ChatMessage } from "./types"
import type { LootEntry } from "./loot"
import { stripLootFences } from "./loot"
import { splitThinkBlocks } from "./thinking"

/**
 * The rarenesses the generator may be asked to return. Single source of truth:
 * the dialog's result-validation gate (add-item-dialog.tsx) imports this list.
 */
export const GENERATABLE_RARITIES: string[] = [
  "common",
  "uncommon",
  "rare",
  "very rare",
  "legendary",
  "artifact",
]

// Cap on how much of the campaign DM prompt enters the generator context (the
// built-in default is ~4.1k chars; this leaves headroom for customs).
export const GENERATOR_SYSTEM_CONTEXT_MAX = 6000

// Bounded recent-chat fallback slice: whole turns only, newest first.
export const CHAT_SLICE_MAX_MESSAGES = 6
export const CHAT_SLICE_MAX_CHARS = 1500

// Name-similarity floor for a loot entry to become a candidate (Jaccard 1/3 ≈
// sharing at least one significant token of a small pair; containment scores higher).
export const CANDIDATE_MIN_SCORE = 1 / 3
export const CANDIDATE_MAX_ENTRIES = 3

// Filler words carried by descriptive names ("A ring of ...") — never identity on their own.
const NAME_STOPWORDS = new Set(["a", "an", "the", "of", "and", "with", "for", "in", "on", "to", "by"])
const NAME_MIN_TOKEN = 2

/**
 * Normalized significant tokens of an item name: lowercased, punctuation removed,
 * light plural fold ("potions"→"potion"), stopwords dropped. Matching math only —
 * display names are never rewritten.
 */
export function nameTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token))
    .filter((token) => token.length >= NAME_MIN_TOKEN && !NAME_STOPWORDS.has(token))
}

/** Order-independent, stopword-insensitive identity key: same key ⇒ same name for exact-match. */
export function nameKey(raw: string): string {
  return nameTokens(raw)
    .sort()
    .join(" ")
}

/**
 * Similarity of a player-typed name to a captured entry name.
 * Same token set → 1; typed ⊆ entry → 1 (the owner's "ring of bone" case);
 * entry ⊆ typed → 0.9 (player elaborates); else Jaccard |∩|/|∪|.
 * Scores RANK candidates only — they never auto-seed (see buildGenerationContext).
 */
export function scoreNamePair(query: string, entry: string): number {
  const a = new Set(nameTokens(query))
  const b = new Set(nameTokens(entry))
  if (a.size === 0 || b.size === 0) return 0
  if (nameKey(query) === nameKey(entry)) return 1
  let inter = 0
  for (const token of a) if (b.has(token)) inter += 1
  const union = a.size + b.size - inter
  if (inter === a.size) return 1 // typed ⊆ captured
  if (inter === b.size) return 0.9 // captured ⊆ typed
  return inter / union
}

export interface LootCandidate {
  entry: LootEntry
  score: number
}

/** Store entries whose name is close enough to be "the same thing the player means", best first. */
export function rankLootCandidates(name: string, entries: LootEntry[]): LootCandidate[] {
  const out: LootCandidate[] = []
  for (const entry of entries) {
    const score = scoreNamePair(name, entry.name)
    if (score >= CANDIDATE_MIN_SCORE) out.push({ entry, score })
  }
  out.sort((first, second) => second.score - first.score)
  return out.slice(0, CANDIDATE_MAX_ENTRIES)
}

/** Exact (order/punctuation/stopword-insensitive) captured entry for a typed name, or null. */
export function findExactLootMatch(name: string, entries: LootEntry[]): LootEntry | null {
  const key = nameKey(name)
  if (!key) return null
  for (const entry of entries) {
    if (nameKey(entry.name) === key) return entry
  }
  return null
}

export interface ChatTurn {
  role: "user" | "assistant"
  text: string
}

/** Narrative text of a chat message: loot fences and inline thinking excluded. */
export function narrativeOnly(content: string): string {
  return splitThinkBlocks(stripLootFences(content || ""))
    .filter((block) => block.type === "text")
    .map((block) => block.content)
    .join("")
    .trim()
}

/**
 * Newest-first bounded slice of the chat for generator context: only user/assistant
 * turns with non-empty narrative, whole turns (no mid-message splits), capped by
 * message count and total chars. If the NEWEST turn alone exceeds the char budget,
 * its tail (the most recent text — where the item talk lives) is kept.
 */
export function pickRecentChat(
  messages: ChatMessage[],
  maxMessages: number = CHAT_SLICE_MAX_MESSAGES,
  maxChars: number = CHAT_SLICE_MAX_CHARS,
): ChatTurn[] {
  const turns: ChatTurn[] = []
  let used = 0
  for (let i = messages.length - 1; i >= 0 && turns.length < maxMessages; i--) {
    const message = messages[i]
    if (message.role !== "user" && message.role !== "assistant") continue
    const text = narrativeOnly(message.content)
    if (!text) continue
    if (used === 0 && text.length > maxChars) {
      return [{ role: message.role, text: text.slice(-maxChars) }]
    }
    if (used + text.length > maxChars) break
    used += text.length
    turns.unshift({ role: message.role, text })
  }
  return turns
}

export type GenerationContext =
  | { kind: "canonical"; entry: LootEntry }
  | { kind: "candidates"; candidates: LootCandidate[] }
  | { kind: "chat"; turns: ChatTurn[] }

/**
 * Chooses the seeding stage: exact match → canonical entry; close names → ranked
 * candidates (model adjudicates); otherwise the bounded chat slice; otherwise null
 * (plain canonical prompt). The player's typed name (when non-empty) always wins
 * over chat context.
 */
export function buildGenerationContext(
  name: string,
  entries: LootEntry[] = [],
  messages: ChatMessage[] = [],
): GenerationContext | null {
  if (name.trim()) {
    const exact = findExactLootMatch(name, entries)
    if (exact) return { kind: "canonical", entry: exact }
    const candidates = rankLootCandidates(name, entries)
    if (candidates.length > 0) return { kind: "candidates", candidates }
  }
  const turns = pickRecentChat(messages)
  if (turns.length > 0) return { kind: "chat", turns }
  return null
}

/** The generator's system message: role + the campaign DM prompt (capped) when provided. */
export function buildGeneratorSystemMessage(campaignPrompt: string): string {
  const base = campaignPrompt.trim()
  if (!base) {
    return "You are the item detail generator for this campaign. Respond only with the JSON object the user message requests — no prose around it."
  }
  const capped = base.length > GENERATOR_SYSTEM_CONTEXT_MAX ? base.slice(0, GENERATOR_SYSTEM_CONTEXT_MAX) : base
  return (
    "You are the item detail generator for this campaign. Respond only with the JSON object the user message requests — no prose around it." +
    "\n\nThe campaign's DM prompt follows. It defines the game system and world this campaign uses — wherever it conflicts with a ruleset you would otherwise assume, it wins." +
    "\n--- Campaign DM prompt ---\n" +
    capped +
    "\n--- End of DM prompt ---"
  )
}

/** The shared JSON contract, with optional pinned values (already-validated by the caller). */
function jsonContract(
  type: "inventory" | "equipment",
  pinned: { name?: string; rarity?: string; quantity?: number } = {},
): string {
  const nameLine = pinned.name ? JSON.stringify(pinned.name) : '"The item\'s name"'
  const rarityLine = pinned.rarity ? JSON.stringify(pinned.rarity) : JSON.stringify("One of: " + GENERATABLE_RARITIES.join(", "))
  const quantityLine =
    type === "inventory"
      ? `,\n  "quantity": ${
          pinned.quantity != null ? String(pinned.quantity) : '"A positive whole number — how many were found"'
        }`
      : ""
  return (
    `\n{\n  "name": ${nameLine},\n  "description": "One to three sentences: what the item is, what it does, and any usage or restrictions",\n  "rarity": ${rarityLine}${quantityLine}\n}`
  )
}

/** The user message for each seeding stage (canonical / candidates / chat / plain). */
export function buildGeneratorUserMessage(
  name: string,
  type: "inventory" | "equipment",
  context: GenerationContext | null,
): string {
  const title = name.trim()

  if (context?.kind === "canonical") {
    const entry = context.entry
    const quantityLine = type === "inventory" ? `\nQuantity: ${entry.quantity}` : ""
    const notesLine = entry.notes ? `\nNotes: ${entry.notes}` : ""
    const rarity = GENERATABLE_RARITIES.includes(entry.rarity) ? entry.rarity : undefined
    return (
      `Provide the details for the item "${title}" exactly as this campaign presented it. This is the captured in-world entry — it is CANONICAL campaign lore and your details must not contradict it:` +
      `\n\nName: ${entry.name}` +
      `\nDescription: ${entry.description}` +
      `\nRarity: ${entry.rarity}${quantityLine}${notesLine}` +
      `\n\nWrite one to three sentences that keep every captured fact (reusing the entry's own wording where it exists), adding at most one short clarifying sentence in the campaign's voice. Then respond with a single JSON object only (no prose) with exactly these fields:` +
      jsonContract(type, { name: entry.name, rarity, quantity: type === "inventory" ? entry.quantity : undefined })
    )
  }

  if (context?.kind === "candidates") {
    const list = context.candidates
      .map((candidate, index) => {
        const lines = [
          `${index + 1}. ${candidate.entry.name}`,
          `   Description: ${candidate.entry.description}`,
          `   Rarity: ${candidate.entry.rarity}`,
        ]
        if (type === "inventory") lines.push(`   Quantity: ${candidate.entry.quantity}`)
        if (candidate.entry.notes) lines.push(`   Notes: ${candidate.entry.notes}`)
        return lines.join("\n")
      })
      .join("\n")
    return (
      `Provide the details for the item "${title}" in the campaign's game system.` +
      `\n\nCaptured entries from this campaign that MAY be this same item under a shorter or fuller name (but may also be DIFFERENT items):` +
      `\n\n${list}` +
      `\n\nIf "${title}" clearly refers to one of these entries — the same item, described differently — base the details on that entry, keep its facts, and use THAT entry's name in the JSON. If it clearly refers to a different item, ignore the entries and provide canonical details for "${title}".` +
      `\n\nRespond with a single JSON object only (no prose) with exactly these fields:` +
      jsonContract(type)
    )
  }

  if (context?.kind === "chat") {
    const transcript = context.turns.map((turn) => `[${turn.role === "assistant" ? "DM" : "You"}] ${turn.text}`).join("\n\n")
    return (
      `Provide the details for the item "${title}" in the campaign's game system.` +
      `\n\nRecent chat from this campaign:\n\n${transcript}` +
      `\n\nIf this chat mentions "${title}", or clearly the same item under a different name or description, base the details on what the chat says and use the in-world name the chat gives it. Otherwise provide canonical details for "${title}".` +
      `\n\nRespond with a single JSON object only (no prose) with exactly these fields:` +
      jsonContract(type)
    )
  }

  return (
    `Provide canonical details for the item "${title}" in the campaign's game system.` +
    `\n\nRespond with a single JSON object only (no prose) with exactly these fields:` +
    jsonContract(type)
  )
}

/** The complete generator request (system + user), ready for the messages array. */
export function buildGeneratorMessages(params: {
  name: string
  type: "inventory" | "equipment"
  context: GenerationContext | null
  campaignPrompt: string
}): { system: string; user: string } {
  return {
    system: buildGeneratorSystemMessage(params.campaignPrompt),
    user: buildGeneratorUserMessage(params.name, params.type, params.context),
  }
}
