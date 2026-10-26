import assert from "node:assert/strict"
import { test } from "node:test"

import {
  NOTES_CONTEXT_KEY,
  NOTES_CONTEXT_MAX_CHARS,
  NOTES_MAX_TOTAL_CHARS,
  NOTES_STORAGE_KEY,
  clampNotesToTotalChars,
  emptyCampaignNotes,
  formatNotesForContext,
  notesTotalChars,
  sanitizeCampaignNotes,
} from "./campaign-notes"

// ---------------------------------------------------------------------------
// Storage contract (keys are written/read by page.tsx and the export/import flows)
// ---------------------------------------------------------------------------

test("storage keys and caps are stable", () => {
  assert.equal(NOTES_STORAGE_KEY, "dnd-campaign-notes")
  assert.equal(NOTES_CONTEXT_KEY, "dnd-notes-in-context")
  assert.equal(NOTES_CONTEXT_MAX_CHARS, 4000)
  // Locked spec: the notes store allows more than the old "15K characters" use case.
  assert.equal(NOTES_MAX_TOTAL_CHARS, 16_000)
  assert.ok(NOTES_MAX_TOTAL_CHARS > 15_000)
})

// ---------------------------------------------------------------------------
// notesTotalChars / clampNotesToTotalChars — the 16K total store cap (TODO #1)
// ---------------------------------------------------------------------------

test("notesTotalChars: sums only the four note fields, ignores lastUpdated", () => {
  assert.equal(notesTotalChars(emptyCampaignNotes()), 0)
  assert.equal(
    notesTotalChars({ plotPoints: "a", npcs: "bb", locations: "ccc", quests: "dddd", lastUpdated: "x1234" }),
    10,
  )
})

test("clampNotesToTotalChars: at-or-under the cap returns the input by reference (identity preserved)", () => {
  const notes = { plotPoints: "a", npcs: "bb", locations: "", quests: "ddd", lastUpdated: "" }
  assert.equal(clampNotesToTotalChars(notes), notes)
  const atCap = emptyCampaignNotes()
  atCap.quests = "q".repeat(NOTES_MAX_TOTAL_CHARS)
  assert.equal(clampNotesToTotalChars(atCap), atCap)
})

test("clampNotesToTotalChars: a single over-cap field lands exactly on the cap", () => {
  const notes = emptyCampaignNotes()
  notes.quests = "q".repeat(NOTES_MAX_TOTAL_CHARS + 4_000)
  const clamped = clampNotesToTotalChars(notes)
  assert.notEqual(clamped, notes)
  assert.equal(clamped.quests.length, NOTES_MAX_TOTAL_CHARS)
  assert.equal(notesTotalChars(clamped), NOTES_MAX_TOTAL_CHARS)
  // the input object itself is never mutated
  assert.equal(notes.quests.length, NOTES_MAX_TOTAL_CHARS + 4_000)
})

test("clampNotesToTotalChars: multi-field over-cap shrinks proportionally, total exactly at the cap", () => {
  const notes = {
    plotPoints: "p".repeat(100),
    npcs: "n".repeat(200),
    locations: "l".repeat(300),
    quests: "q".repeat(400),
    lastUpdated: "ts",
  }
  const clamped = clampNotesToTotalChars(notes, 100)
  assert.equal(notesTotalChars(clamped), 100)
  // 10% scale: 10/20/30/40 — every non-empty field still has a voice
  assert.equal(clamped.plotPoints.length, 10)
  assert.equal(clamped.npcs.length, 20)
  assert.equal(clamped.locations.length, 30)
  assert.equal(clamped.quests.length, 40)
  assert.equal(clamped.lastUpdated, "ts")
})

test("clampNotesToTotalChars: floor rounding leftovers are handed back from the top", () => {
  const notes = { plotPoints: "p".repeat(10), npcs: "n".repeat(10), locations: "", quests: "", lastUpdated: "" }
  const clamped = clampNotesToTotalChars(notes, 5)
  assert.equal(notesTotalChars(clamped), 5)
  assert.equal(clamped.plotPoints.length, 3)
  assert.equal(clamped.npcs.length, 2)
})

test("clampNotesToTotalChars: max of 0 clears every field", () => {
  const notes = { plotPoints: "p", npcs: "n", locations: "l", quests: "q", lastUpdated: "ts" }
  const clamped = clampNotesToTotalChars(notes, 0)
  assert.equal(notesTotalChars(clamped), 0)
  assert.equal(clamped.lastUpdated, "ts")
})

test("sanitizeCampaignNotes: over-cap untrusted payloads are clamped into budget", () => {
  const out = sanitizeCampaignNotes({ plotPoints: "p".repeat(NOTES_MAX_TOTAL_CHARS), quests: "q".repeat(5_000) })
  assert.ok(out)
  assert.equal(notesTotalChars(out), NOTES_MAX_TOTAL_CHARS)
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
