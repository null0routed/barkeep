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
  const notes: CampaignNotes = {
    plotPoints: asString(record.plotPoints),
    npcs: asString(record.npcs),
    locations: asString(record.locations),
    quests: asString(record.quests),
    lastUpdated: asString(record.lastUpdated),
  }
  return notes.plotPoints || notes.npcs || notes.locations || notes.quests ? notes : null
}

const NOTE_FIELDS: Array<[keyof CampaignNotes, string]> = [
  ["plotPoints", "Plot Points"],
  ["npcs", "NPCs"],
  ["locations", "Locations"],
  ["quests", "Quests"],
]

/** Formats the notes as a labeled context block for the model; "" when nothing to include. */
export function formatNotesForContext(notes: CampaignNotes, maxChars: number = NOTES_CONTEXT_MAX_CHARS): string {
  const lines: string[] = []
  for (const [field, label] of NOTE_FIELDS) {
    const value = notes[field]
    if (value) lines.push(`${label}: ${value}`)
  }
  if (lines.length === 0) return ""
  let body = lines.join("\n")
  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars).trimEnd()}\n[notes truncated for context]`
  }
  return `CAMPAIGN NOTES (the player's private notes):\n${body}\n\n`
}
