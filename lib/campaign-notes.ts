import type { CampaignNotes } from "./types"

/**
 * Player-authored campaign notes: storage keys, sanitization, and the context block
 * injected into model requests when the player opts in. Deliberately separate from AI
 * checkpoints (lib/campaign-checkpoints.ts): notes are the player's private record.
 */

export const NOTES_STORAGE_KEY = "dnd-campaign-notes"
/** "1"/"0" flag: when on, the notes are included in each model request */
export const NOTES_CONTEXT_KEY = "dnd-notes-in-context"
// Cap (characters) on the notes block injected per request, so long notes can't blow
// up the context window. Longer notes are still fully visible in the UI.
export const NOTES_CONTEXT_MAX_CHARS = 4000

/**
 * Total character cap on the notes store, across ALL four fields (TODO #1, locked spec).
 * Chosen to comfortably allow the old "15K" use case while keeping the notes tiny
 * relative to the 4 MB global storage budget (16K chars ≈ 32 KB worst case).
 * The 4K context cap above is a different knob (model context), unaffected by this.
 */
export const NOTES_MAX_TOTAL_CHARS = 16_000

export function emptyCampaignNotes(): CampaignNotes {
  return { plotPoints: "", npcs: "", locations: "", quests: "", lastUpdated: "" }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Validates untrusted data (localStorage contents or an imported file) into a clean
 * notes object. Returns null when it's not an object or has no note content at all.
 */
export function sanitizeCampaignNotes(raw: unknown): CampaignNotes | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  // Enforce the total cap on untrusted input (localStorage leftovers, old exports),
  // so a hand-edited file can't push the persist over the storage budget either.
  const notes = clampNotesToTotalChars({
    plotPoints: asString(record.plotPoints),
    npcs: asString(record.npcs),
    locations: asString(record.locations),
    quests: asString(record.quests),
    lastUpdated: asString(record.lastUpdated),
  })
  return notes.plotPoints || notes.npcs || notes.locations || notes.quests ? notes : null
}

const NOTE_FIELDS: Array<[Exclude<keyof CampaignNotes, "lastUpdated">, string]> = [
  ["plotPoints", "Plot Points"],
  ["npcs", "NPCs"],
  ["locations", "Locations"],
  ["quests", "Quests"],
]

/** Current total character usage across the four note fields (for the UI counter). */
export function notesTotalChars(notes: CampaignNotes): number {
  return NOTE_FIELDS.reduce((sum, [key]) => sum + notes[key].length, 0)
}

/**
 * Enforces NOTES_MAX_TOTAL_CHARS across the four note fields (TODO #1, locked spec).
 * Under the cap the input is returned by reference (identity preserved for memo
 * patterns). Over the cap the fields are shrunk proportionally — every field keeps
 * its share — and any leftover budget (floor rounding) is handed back from the top,
 * so the result lands EXACTLY on the cap and the ordering is deterministic.
 */
export function clampNotesToTotalChars(notes: CampaignNotes, max: number = NOTES_MAX_TOTAL_CHARS): CampaignNotes {
  const fields = NOTE_FIELDS.map(([key]) => notes[key])
  const total = fields.reduce((sum, value) => sum + value.length, 0)
  if (max <= 0) {
    const cleared = { ...notes }
    for (const [key] of NOTE_FIELDS) cleared[key] = ""
    return cleared
  }
  if (total <= max) return notes

  const scaled = fields.map((value) => Math.floor(value.length * (max / total)))
  let leftover = max - scaled.reduce((sum, size) => sum + size, 0)
  for (let i = 0; i < scaled.length && leftover > 0; i++) {
    const give = Math.min(fields[i].length - scaled[i], leftover)
    scaled[i] += give
    leftover -= give
  }

  const clamped = { ...notes }
  NOTE_FIELDS.forEach(([key], i) => {
    clamped[key] = notes[key].slice(0, scaled[i])
  })
  return clamped
}

/** Formats the notes as a labeled context block for the model; "" when nothing to include. */
export function formatNotesForContext(notes: CampaignNotes, maxChars: number = NOTES_CONTEXT_MAX_CHARS): string {
  const lines: string[] = []
  for (const [field, label] of NOTE_FIELDS) {
    const value = notes[field].trim()
    if (value) lines.push(`${label}: ${value}`)
  }
  if (lines.length === 0) return ""
  let body = lines.join("\n")
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars).trimEnd()}\n[notes truncated for context]`
  }
  return `CAMPAIGN NOTES (the player's private notes):\n${body}\n\n`
}
