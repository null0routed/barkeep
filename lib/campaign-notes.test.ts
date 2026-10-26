import assert from "node:assert/strict"
import { test } from "node:test"

import {
  NOTES_CONTEXT_KEY,
  NOTES_CONTEXT_MAX_CHARS,
  NOTES_STORAGE_KEY,
  emptyCampaignNotes,
  formatNotesForContext,
  sanitizeCampaignNotes,
} from "./campaign-notes"

// ---------------------------------------------------------------------------
// Storage contract (keys are written/read by page.tsx and the export/import flows)
// ---------------------------------------------------------------------------

test("storage keys and cap are stable", () => {
  assert.equal(NOTES_STORAGE_KEY, "dnd-campaign-notes")
  assert.equal(NOTES_CONTEXT_KEY, "dnd-notes-in-context")
  assert.equal(NOTES_CONTEXT_MAX_CHARS, 4000)
})

// ---------------------------------------------------------------------------
// emptyCampaignNotes / sanitizeCampaignNotes — untrusted-input gate
// ---------------------------------------------------------------------------

test("emptyCampaignNotes: all fields blank strings", () => {
  assert.deepEqual(emptyCampaignNotes(), { plotPoints: "", npcs: "", locations: "", quests: "", lastUpdated: "" })
})

test("sanitizeCampaignNotes: non-objects, empty notes, and junk-only payloads yield null", () => {
  assert.equal(sanitizeCampaignNotes(null), null)
  assert.equal(sanitizeCampaignNotes("notes"), null)
  assert.equal(sanitizeCampaignNotes([1, 2]), null)
  assert.equal(sanitizeCampaignNotes({}), null)
  assert.equal(sanitizeCampaignNotes({ plotPoints: "   ", npcs: "", locations: 7, quests: null }), null)
})

test("sanitizeCampaignNotes: keeps trimmed strings, drops non-strings, preserves lastUpdated if a string", () => {
  const notes = sanitizeCampaignNotes({
    plotPoints: "  The inn burned  ",
    npcs: "Voss",
    locations: 42,
    quests: false,
    lastUpdated: "2026-10-25T00:00:00.000Z",
    extra: "ignored",
  })
  assert.ok(notes)
  assert.equal(notes.plotPoints, "The inn burned")
  assert.equal(notes.npcs, "Voss")
  assert.equal(notes.locations, "")
  assert.equal(notes.quests, "")
  assert.equal(notes.lastUpdated, "2026-10-25T00:00:00.000Z")

  const noTimestamp = sanitizeCampaignNotes({ npcs: "Someone" })
  assert.ok(noTimestamp)
  assert.equal(noTimestamp.lastUpdated, "")
  assert.equal(noTimestamp.plotPoints, "")
})

// ---------------------------------------------------------------------------
// formatNotesForContext — exact block injected into model requests
// ---------------------------------------------------------------------------

const HEADER = "CAMPAIGN NOTES (the player's private notes):\n"

test("formatNotesForContext: empty notes yield no context at all (\"\" — zero model-side cost)", () => {
  assert.equal(formatNotesForContext(emptyCampaignNotes()), "")
  assert.equal(formatNotesForContext({ ...emptyCampaignNotes(), plotPoints: "   " }), "")
})

test("formatNotesForContext: labeled lines in fixed order, blanks skipped, trailing blank line", () => {
  assert.equal(
    formatNotesForContext({ plotPoints: "a", npcs: "b", locations: "c", quests: "d", lastUpdated: "x" }),
    `${HEADER}Plot Points: a\nNPCs: b\nLocations: c\nQuests: d\n\n`
  )
  assert.equal(formatNotesForContext({ ...emptyCampaignNotes(), npcs: "b" }), `${HEADER}NPCs: b\n\n`)
})

test("formatNotesForContext: enforces the char cap with an explicit truncation marker", () => {
  const long = emptyCampaignNotes()
  long.quests = "p".repeat(999)
  long.plotPoints = "q".repeat(999)
  const maxChars = 400
  const result = formatNotesForContext(long, maxChars)

  assert.ok(result.startsWith(HEADER))
  assert.ok(result.endsWith("\n[notes truncated for context]\n\n"))
  // body is exactly maxChars when no trimming of trailing whitespace applies; +32 = "\n[notes truncated for context]" (30) + trailing "\n\n" (2)
  assert.equal(result.length, HEADER.length + maxChars + 32)
})
