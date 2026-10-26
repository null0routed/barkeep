import assert from "node:assert/strict"
import { test } from "node:test"

import { DEFAULT_SYSTEM_PROMPT } from "./default-prompts"
import { isUnchangedBuiltInPrompt, migrateStoredSystemPrompt, resolveSystemPrompt } from "./system-prompt"

// ---------------------------------------------------------------------------
// resolveSystemPrompt — what actually reaches the model
// ---------------------------------------------------------------------------

test("resolveSystemPrompt: blank and whitespace-only custom prompts fall back to the built-in", () => {
  assert.equal(resolveSystemPrompt(""), DEFAULT_SYSTEM_PROMPT)
  assert.equal(resolveSystemPrompt("   \n\t "), DEFAULT_SYSTEM_PROMPT)
})

test("resolveSystemPrompt: a non-blank custom prompt fully replaces the built-in (verbatim, no trimming)", () => {
  assert.equal(resolveSystemPrompt("Grim tone only. No mercy."), "Grim tone only. No mercy.")
  assert.equal(resolveSystemPrompt("  Keep it short  "), "  Keep it short  ")
  // Even a custom prompt that merely *contains* the default is the player's word — returned as-is.
  const embedded = `My house rules:\n\n${DEFAULT_SYSTEM_PROMPT}`
  assert.equal(resolveSystemPrompt(embedded), embedded)
})

// ---------------------------------------------------------------------------
// isUnchangedBuiltInPrompt — the exact-copy detector
// ---------------------------------------------------------------------------

test("isUnchangedBuiltInPrompt: only the byte-for-byte default matches", () => {
  assert.equal(isUnchangedBuiltInPrompt(DEFAULT_SYSTEM_PROMPT), true)
  assert.equal(isUnchangedBuiltInPrompt(""), false)
  assert.equal(isUnchangedBuiltInPrompt(DEFAULT_SYSTEM_PROMPT + "\nStrict about dice rolls."), false)
  assert.equal(isUnchangedBuiltInPrompt(DEFAULT_SYSTEM_PROMPT.slice(1)), false)
  assert.equal(isUnchangedBuiltInPrompt("something totally different"), false)
})

// ---------------------------------------------------------------------------
// migrateStoredSystemPrompt — localStorage + import migration
// ---------------------------------------------------------------------------

test("migrateStoredSystemPrompt: null and blank state migrate to '' (built-in will be used)", () => {
  assert.equal(migrateStoredSystemPrompt(null), "")
  assert.equal(migrateStoredSystemPrompt(undefined), "")
  assert.equal(migrateStoredSystemPrompt(""), "")
})

test("migrateStoredSystemPrompt: an untouched default copy (stored by the app itself) is reset to ''", () => {
  assert.equal(migrateStoredSystemPrompt(DEFAULT_SYSTEM_PROMPT), "")
})

test("migrateStoredSystemPrompt: a genuine customization is preserved as the player's value", () => {
  const customized = DEFAULT_SYSTEM_PROMPT + "\n\nHouse rule: no dragons in Act One."
  assert.equal(migrateStoredSystemPrompt(customized), customized)
  assert.equal(migrateStoredSystemPrompt("A completely different voice."), "A completely different voice.")
})
