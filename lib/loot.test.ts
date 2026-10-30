import assert from "node:assert/strict"
import { test } from "node:test"

import {
  LOOT_BLOCK_LANG,
  LOOT_CAPTURE_PROMPT,
  LOOT_MAX_ENTRIES,
  LOOT_STORAGE_KEY,
  collectLoot,
  entryKey,
  mergeLoot,
  parseLootBlock,
  sanitizeStoredLoot,
  stripLootFences,
} from "./loot"
import type { LootEntry } from "./loot"

const fence = (body: string) => "```" + LOOT_BLOCK_LANG + "\n" + body + "\n```"

const VALID_ENTRY = [
  {
    name: "Dagger of Venom",
    description: "Fine dagger, +1 on attacks against constructs",
    rarity: "rare",
    quantity: 1,
    notes: "Found in the vault; hums near goblin gold",
  },
]

// ---------------------------------------------------------------------------
// Constants & schema-drift guards
// ---------------------------------------------------------------------------

test("constants: block language, storage key, and store cap are what the plan locked", () => {
  assert.equal(LOOT_BLOCK_LANG, "barkeep-loot")
  assert.equal(LOOT_STORAGE_KEY, "dnd-loot")
  assert.equal(LOOT_MAX_ENTRIES, 25)
})

test("LOOT_CAPTURE_PROMPT: teaches the fence tag and every field (schema-drift guard)", () => {
  assert.ok(LOOT_CAPTURE_PROMPT.includes("```" + LOOT_BLOCK_LANG))
  for (const field of ["name", "description", "rarity", "quantity", "notes"]) {
    assert.ok(LOOT_CAPTURE_PROMPT.includes('"' + field + '"'), "missing field: " + field)
  }
})

// ---------------------------------------------------------------------------
// stripLootFences — the player never sees the machine block
// ---------------------------------------------------------------------------

test("stripLootFences: removes the fence, keeps the surrounding narrative", () => {
  const message = "The vault groans open...\n\n" + fence(JSON.stringify(VALID_ENTRY))
  const out = stripLootFences(message)
  assert.ok(out.startsWith("The vault groans open..."))
  assert.ok(!out.includes(LOOT_BLOCK_LANG))
  assert.ok(!out.includes("Dagger of Venom"))
})

test("stripLootFences: content without a fence is passed through untouched", () => {
  const plain = "No finds this time.\nWhat do you do?"
  assert.equal(stripLootFences(plain), plain)
})

test("stripLootFences: every fence in a message is removed", () => {
  const a = fence(JSON.stringify(VALID_ENTRY))
  const b = fence(JSON.stringify([{ name: "Gold", description: "120 gp in coins", rarity: "common", quantity: 120 }]))
  const out = stripLootFences("Scene one\n\n" + a + "\n\nScene two\n\n" + b)
  assert.equal(out.split(LOOT_BLOCK_LANG).length, 1)
  assert.ok(out.includes("Scene one"))
  assert.ok(out.includes("Scene two"))
})

test("stripLootFences: CRLF fences are removed and blank runs collapse", () => {
  const crlf = "```" + LOOT_BLOCK_LANG + "\r\n" + JSON.stringify(VALID_ENTRY) + "\r\n```"
  const out = stripLootFences("Before\r\n\r\n" + crlf + "\r\n\r\nAfter")
  assert.ok(!out.includes(LOOT_BLOCK_LANG))
  assert.ok(!out.includes("\n\n\n"))
  assert.ok(out.includes("Before"))
  assert.ok(out.includes("After"))
})

test("stripLootFences: an OPEN fence still streaming in (no closing fence yet) is hidden", () => {
  const streaming = "```" + LOOT_BLOCK_LANG + "\n[{ \"name\": \"Dagg"
  const out = stripLootFences("The vault groans open...\n\n" + streaming)
  assert.ok(!out.includes(LOOT_BLOCK_LANG))
  assert.ok(out.startsWith("The vault groans open..."))
})

test("stripLootFences: an open fence with an empty body (just tagged) is hidden", () => {
  const out = stripLootFences("The party regroups.\n\n" + "```" + LOOT_BLOCK_LANG + "\n")
  assert.ok(!out.includes(LOOT_BLOCK_LANG))
  assert.ok(out.startsWith("The party regroups."))
})

test("stripLootFences: an unclosed fence whose body is prose is still left alone", () => {
  const unclosed = "```" + LOOT_BLOCK_LANG + "\nThe chest creaks open and gold spills out"
  const message = "Narrative\n\n" + unclosed + "\n\nMore narrative that must survive"
  const out = stripLootFences(message)
  assert.ok(out.includes(LOOT_BLOCK_LANG))
  assert.ok(out.includes("More narrative that must survive"))
})

// ---------------------------------------------------------------------------
// parseLootBlock — tolerant parsing, strict normalization
// ---------------------------------------------------------------------------

test("parseLootBlock: valid array normalizes (rarity lowercase, quantity number, notes kept)", () => {
  const out = parseLootBlock(JSON.stringify([{ ...VALID_ENTRY[0], rarity: " RARE ", quantity: "1" }]))
  assert.ok(out)
  assert.equal(out.length, 1)
  assert.equal(out[0].rarity, "rare")
  assert.equal(out[0].quantity, 1)
  assert.equal(out[0].notes, "Found in the vault; hums near goblin gold")
})

test("parseLootBlock: a single object is wrapped into a one-entry result", () => {
  const out = parseLootBlock(JSON.stringify(VALID_ENTRY[0]))
  assert.ok(out)
  assert.equal(out.length, 1)
  assert.equal(out[0].name, "Dagger of Venom")
})

test("parseLootBlock: prose around the JSON is tolerated", () => {
  const out = parseLootBlock('Here is your loot: ' + JSON.stringify(VALID_ENTRY) + " — enjoy!")
  assert.ok(out)
  assert.equal(out.length, 1)
})

test("parseLootBlock: bad rarity falls back to unknown; bad quantities fall back to 1", () => {
  const out = parseLootBlock(
    JSON.stringify([
      { name: "A", description: "d", rarity: "mythic" },
      { name: "B", description: "d", quantity: 0 },
      { name: "C", description: "d", quantity: -3 },
      { name: "D", description: "d", quantity: "three" },
      { name: "E", description: "d", quantity: "4" },
      { name: "F", description: "d", quantity: 1_000_000 },
    ]),
  )
  assert.ok(out)
  const byName = new Map(out.map((e) => [e.name, e] as const))
  const get = (name: string): LootEntry => {
    const entry = byName.get(name)
    assert.ok(entry)
    return entry
  }
  assert.equal(get("A").rarity, "unknown")
  assert.equal(get("B").quantity, 1)
  assert.equal(get("C").quantity, 1)
  assert.equal(get("D").quantity, 1)
  assert.equal(get("E").quantity, 4)
  assert.equal(get("F").quantity, 9999)
})

test("parseLootBlock: field caps are enforced and over-sized blocks are truncated to 10", () => {
  const longName = "n".repeat(150)
  const longDesc = "d".repeat(500)
  const out = parseLootBlock(
    JSON.stringify([{ name: longName, description: longDesc, notes: "x".repeat(500) }]),
  )
  assert.ok(out)
  assert.equal(out[0].name.length, 100)
  assert.equal(out[0].description.length, 400)
  assert.equal(out[0].notes?.length, 400)

  const many = Array.from({ length: 12 }, (_, i) => ({ name: "I" + i, description: "d" }))
  assert.equal(parseLootBlock(JSON.stringify(many))?.length, 10)
})

test("parseLootBlock: malformed input → null; entries missing required fields are dropped", () => {
  assert.equal(parseLootBlock("no json at all"), null)
  assert.equal(parseLootBlock(""), null)

  const out = parseLootBlock(
    JSON.stringify([{ name: "Only name" }, { description: "Only desc" }, { name: "Good", description: "d" }]),
  )
  assert.ok(out)
  assert.equal(out.length, 1)
  assert.equal(out[0].name, "Good")
})

// ---------------------------------------------------------------------------
// collectLoot — full-message extraction
// ---------------------------------------------------------------------------

test("collectLoot: multiple fences flatten and dedupe; no fences → []", () => {
  assert.equal(collectLoot("plain narrative").length, 0)

  const message =
    "Part one\n\n" +
    fence(JSON.stringify(VALID_ENTRY)) +
    "\n\nRepeating it\n\n" +
    fence(JSON.stringify(VALID_ENTRY)) +
    "\n\nPlus more\n\n" +
    fence(JSON.stringify([{ name: "Potion of Healing", description: "Restores 2d4+1 HP", rarity: "common", quantity: 2 }]))
  const out = collectLoot(message)
  assert.equal(out.length, 2)
  assert.equal(out[0].name, "Dagger of Venom")
  assert.equal(out[1].name, "Potion of Healing")
})

// ---------------------------------------------------------------------------
// mergeLoot — capped, newest-first, idempotent
// ---------------------------------------------------------------------------

test("entryKey: case-insensitive, description-aware identity", () => {
  assert.equal(entryKey({ name: "Dagger of Venom", description: "Fine dagger" }), entryKey({ name: "dagger of venom", description: "  fine dagger " }))
  assert.notEqual(entryKey({ name: "Dagger", description: "a" }), entryKey({ name: "Dagger", description: "b" }))
})

test("mergeLoot: fresh finds lead, dedupe by identity, capped at 25, idempotent", () => {
  const store: LootEntry[] = Array.from(
    { length: 30 },
    (_, i) => ({ name: "Old" + i, description: "d" + i, rarity: "common", quantity: 1 }),
  )
  const fresh: LootEntry[] = [
    { name: "New Find", description: "d", rarity: "common", quantity: 1 },
    { name: "Old0", description: "d0", rarity: "common", quantity: 1 },
  ]

  const merged = mergeLoot(store, fresh)
  assert.equal(merged.length, LOOT_MAX_ENTRIES)
  assert.equal(merged[0].name, "New Find")
  // The re-captured "Old0" must not appear twice.
  assert.equal(merged.filter((e) => e.name === "Old0").length, 1)

  const again = mergeLoot(merged, fresh)
  assert.equal(again.length, LOOT_MAX_ENTRIES)
  assert.equal(again[0].name, "New Find")
  assert.deepEqual(again, merged)
})

// ---------------------------------------------------------------------------
// sanitizeStoredLoot — untrusted stores/imports
// ---------------------------------------------------------------------------

test("sanitizeStoredLoot: non-arrays → []; garbage dropped; valid entries survive", () => {
  assert.deepEqual(sanitizeStoredLoot(null), [])
  assert.deepEqual(sanitizeStoredLoot("nope"), [])
  assert.deepEqual(sanitizeStoredLoot([42, null, { name: "No desc" }, { name: "Keeper", description: "d" }]), [
    { name: "Keeper", description: "d", rarity: "unknown", quantity: 1 },
  ])
})
