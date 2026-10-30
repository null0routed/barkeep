import assert from "node:assert/strict"
import { test } from "node:test"

import {
  CANDIDATE_MAX_ENTRIES,
  CANDIDATE_MIN_SCORE,
  CHAT_SLICE_MAX_CHARS,
  CHAT_SLICE_MAX_MESSAGES,
  GENERATABLE_RARITIES,
  GENERATOR_SYSTEM_CONTEXT_MAX,
  buildGenerationContext,
  buildGeneratorMessages,
  type GenerationContext,
  buildGeneratorSystemMessage,
  buildGeneratorUserMessage,
  findExactLootMatch,
  nameKey,
  nameTokens,
  narrativeOnly,
  pickRecentChat,
  rankLootCandidates,
  scoreNamePair,
} from "./item-seed"
import type { LootEntry } from "./loot"
import { LOOT_BLOCK_LANG } from "./loot"
import type { ItemRarity, ChatMessage } from "./types"
import { DEFAULT_SYSTEM_PROMPT } from "./default-prompts"

// Inline thinking tags, built by concatenation for the same sanitizer reason as lib/thinking.ts.
const THINK_OPEN = "<" + "thinking>"
const THINK_CLOSE = "</" + "thinking" + ">"
const lootFence = (body: string) => "```" + LOOT_BLOCK_LANG + "\n" + body + "\n```"

const entry = (
  name: string,
  description = "Some description",
  rarity: ItemRarity = "common",
  quantity = 1,
  notes?: string,
): LootEntry => ({ name, description, rarity, quantity, ...(notes ? { notes } : {}) })

const msg = (role: "user" | "assistant" | "system", content: string, id = Math.random().toString(36)): ChatMessage => ({
  id,
  role,
  content,
})

// ---------------------------------------------------------------------------
// Name normalization & scoring
// ---------------------------------------------------------------------------

test("nameTokens: case, punctuation, stopwords, and light plural fold are ignored", () => {
  assert.deepEqual(nameTokens("A ring of pale, almost translucent bone"), [
    "ring",
    "pale",
    "almost",
    "translucent",
    "bone",
  ])
  assert.deepEqual(nameTokens("Bone Ring!!"), ["bone", "ring"])
  assert.deepEqual(nameTokens("Potions"), ["potion"])
  assert.deepEqual(nameTokens("The of and with"), [])
})

test("nameKey: word-order independent identity — bone ring === ring of bone", () => {
  assert.equal(nameKey("Bone Ring"), nameKey("ring of bone"))
  assert.notEqual(nameKey("bone ring"), nameKey("ring of pale almost translucent bone"))
  assert.equal(nameKey("Potion of Healing"), nameKey("healing potion"))
})

test("scoreNamePair: owner case — 'ring of bone' inside the long descriptive entry → 1.0", () => {
  assert.equal(scoreNamePair("ring of bone", "A ring of pale, almost translucent bone"), 1)
  assert.equal(scoreNamePair("Ring of Pale Translucent Bone", "A ring of pale, almost translucent bone"), 1)
})

test("scoreNamePair: captured ⊆ typed → 0.9; unrelated → 0; partial overlap → Jaccard", () => {
  assert.equal(
    scoreNamePair("ring of pale almost translucent bone with a rune", "ring of pale almost translucent bone"),
    0.9,
  )
  assert.equal(scoreNamePair("sword", "ring of bone"), 0)
  // {ring, bone} vs {ring, gem}: 1 shared / 3 union
  assert.ok(Math.abs(scoreNamePair("ring of bone", "ring of gem") - 1 / 3) < 1e-9)
})

// ---------------------------------------------------------------------------
// Candidate ranking & exact match
// ---------------------------------------------------------------------------

test("findExactLootMatch: matches case/punctuation/order; containment alone is NOT an exact match", () => {
  const ring = entry("A ring of pale, almost translucent bone", "Humming bone ring", "rare", 1, "Found in the ossuary")
  const entries = [ring, entry("Dagger of Venom")]

  assert.equal(findExactLootMatch("ring of pale, almost translucent bone", entries), ring)
  assert.equal(findExactLootMatch("BONE", entries), null)
  assert.equal(findExactLootMatch("ring of bone", entries), null) // close, but not exact
  assert.equal(findExactLootMatch("", entries), null)
  assert.equal(findExactLootMatch("ring of bone", []), null)
})

test("rankLootCandidates: floor, ordering, and cap", () => {
  assert.equal(CANDIDATE_MIN_SCORE, 1 / 3)
  assert.equal(CANDIDATE_MAX_ENTRIES, 3)

  const entries = [
    entry("Potion of Healing"), // {potion, healing} vs {ring, bone, gem} → 0 → excluded
    entry("Ring of Gem"), // Jaccard 1/3 → in
    entry("A ring of pale, almost translucent bone"), // containment → 1.0 → top
    entry("Bone Amulet"), // {bone} shared → Jaccard 1/2 → in
    entry("Bone Lantern"), // 1/3 → in → would be 4th overall → capped
    entry("Bone Chalice"), // 1/3 → in → 5th → dropped by cap
  ]
  const ranked = rankLootCandidates("ring of bone", entries)
  assert.ok(ranked.length <= CANDIDATE_MAX_ENTRIES)
  assert.ok(ranked.length >= 3) // at least the clear ones
  assert.equal(ranked[0].entry.name, "A ring of pale, almost translucent bone")
  assert.ok(ranked.every((candidate) => candidate.entry.name !== "Potion of Healing"))
  const scores = ranked.map((candidate) => candidate.score)
  assert.deepEqual([...scores].sort((a, b) => b - a), scores)
})

// ---------------------------------------------------------------------------
// Chat slice
// ---------------------------------------------------------------------------

test("narrativeOnly: loot fences and inline thinking are excluded, narrative kept", () => {
  const raw = "You find a glowing ring." + "\n\n" + lootFence('["not json"]') + "\n" + THINK_OPEN + "musing" + THINK_CLOSE + " It hums."
  assert.equal(narrativeOnly(raw), "You find a glowing ring.\n\n It hums.")
  assert.equal(narrativeOnly(""), "")
})

test("pickRecentChat: newest-first whole turns, chronological output, system/empty skipped", () => {
  const messages: ChatMessage[] = Array.from({ length: 9 }, (_, i) =>
    msg(i % 2 === 0 ? "user" : "assistant", "Turn " + (i + 1) + "."),
  )
  const turns = pickRecentChat(messages)
  assert.equal(turns.length, CHAT_SLICE_MAX_MESSAGES)
  assert.equal(turns[0].text, "Turn 4.") // oldest of the newest 6
  assert.equal(turns[turns.length - 1].text, "Turn 9.")

  const withNoise: ChatMessage[] = [msg("system", "ignore"), msg("assistant", "   "), ...messages]
  assert.equal(pickRecentChat(withNoise).length, CHAT_SLICE_MAX_MESSAGES)
})

test("pickRecentChat: char budget respected; a single oversized newest turn keeps its tail", () => {
  const big = "x".repeat(2000)
  const turns = pickRecentChat([msg("assistant", big)])
  assert.equal(turns.length, 1)
  assert.equal(turns[0].text.length, CHAT_SLICE_MAX_CHARS)

  const two = [msg("user", "a".repeat(800)), msg("assistant", "b".repeat(800))]
  const sliced = pickRecentChat(two)
  // Newest (800) fits; older (800) does not fit in the remaining 700 → stops.
  assert.equal(sliced.length, 1)
  assert.equal(sliced[0].text.length, 800)
})

// ---------------------------------------------------------------------------
// Stage selection
// ---------------------------------------------------------------------------

test("buildGenerationContext: exact match → canonical entry", () => {
  const ring = entry("A ring of pale, almost translucent bone")
  const context = buildGenerationContext("ring of pale almost translucent bone", [ring], [msg("user", "anything")])
  assert.deepEqual(context, { kind: "canonical", entry: ring })
})

test("buildGenerationContext: containment (not exact) → candidates tier", () => {
  const ring = entry("A ring of pale, almost translucent bone")
  const context = buildGenerationContext("ring of bone", [ring], [msg("user", "anything")])
  assert.ok(context && context.kind === "candidates")
  if (context?.kind === "candidates") {
    assert.equal(context.candidates[0].entry.name, ring.name)
    assert.equal(context.candidates[0].score, 1)
  }
})

test("buildGenerationContext: no loot signal → chat slice; nothing at all → null", () => {
  const messages = [msg("user", "We open the chest."), msg("assistant", "A bone ring inside!")]
  assert.equal(buildGenerationContext("totally unrelated item name", [], messages)?.kind, "chat")
  assert.equal(buildGenerationContext("totally unrelated item name", [], []), null)
  assert.equal(buildGenerationContext("", [], messages)?.kind, "chat") // empty name still offers chat context
})

test("buildGenerationContext: any loot match beats chat; the model never sees both at once", () => {
  const dagger = entry("Dagger of Venom")
  const messages = [msg("assistant", "A dagger, clearly venomous.")]
  assert.equal(buildGenerationContext("dagger", [dagger], messages)?.kind, "candidates")
})

// ---------------------------------------------------------------------------
// Generated request — wording & shape
// ---------------------------------------------------------------------------

test("GENERATOR_SYSTEM_CONTEXT_MAX covers the built-in default prompt (drift guard)", () => {
  assert.ok(DEFAULT_SYSTEM_PROMPT.length <= GENERATOR_SYSTEM_CONTEXT_MAX)
})

test("GENERATABLE_RARITIES: the exact six-rung ladder (single source of truth)", () => {
  assert.deepEqual(GENERATABLE_RARITIES, ["common", "uncommon", "rare", "very rare", "legendary", "artifact"])
})

test("buildGeneratorSystemMessage: role line alone without a prompt; with a prompt, capped", () => {
  const bare = buildGeneratorSystemMessage("   ")
  assert.ok(bare.includes("item detail generator"))
  assert.ok(!bare.includes("--- Campaign DM prompt ---"))

  const long = "z".repeat(GENERATOR_SYSTEM_CONTEXT_MAX + 500)
  const capped = buildGeneratorSystemMessage(long)
  assert.ok(capped.includes("--- Campaign DM prompt ---"))
  assert.ok(capped.includes("z".repeat(GENERATOR_SYSTEM_CONTEXT_MAX)))
  assert.ok(!capped.includes("z".repeat(GENERATOR_SYSTEM_CONTEXT_MAX + 1)))
  assert.ok(capped.includes("--- End of DM prompt ---"))
})

test("canonical message: entry facts all present; rarity pinned; quantity follows the dialog type", () => {
  const ring = entry("A ring of pale, almost translucent bone", "Humming bone ring", "rare", 3, "Found in the ossuary")
  const inventory = buildGeneratorUserMessage("ring of bone", "inventory", { kind: "canonical", entry: ring })
  for (const needle of [
    "A ring of pale, almost translucent bone",
    "Humming bone ring",
    "Found in the ossuary",
    "Rarity: rare",
    "Quantity: 3",
    "CANONICAL campaign lore",
  ]) {
    assert.ok(inventory.includes(needle), "missing: " + needle)
  }
  assert.ok(inventory.includes('"rarity": "rare"')) // pinned, not the options list

  const equipment = buildGeneratorUserMessage("ring of bone", "equipment", { kind: "canonical", entry: ring })
  assert.ok(!equipment.includes("Quantity:"))
  assert.ok(!/,"quantity"/.test(equipment)) // no quantity in the contract either
})

test("candidates message: model-adjudication wording and the escape hatch for different items", () => {
  const context = buildGenerationContext("ring of bone", [entry("A ring of pale, almost translucent bone")], [])
  assert.ok(context && context.kind === "candidates")
  const user = buildGeneratorUserMessage("ring of bone", "inventory", context)
  assert.ok(user.includes("MAY be this same item"))
  assert.ok(user.includes("A ring of pale, almost translucent bone"))
  assert.ok(user.includes("different item"))
  assert.ok(user.includes("use THAT entry's name in the JSON"))
})

test("chat message: [DM]/[You] transcript, narrative only, fenced/machine text never reaches the prompt", () => {
  const messages = [
    msg("user", "Open the chest."),
    msg("assistant", "A bone ring, pale as moonlight." + "\n" + lootFence('[{"name":"Bone Ring"}]') + "\n" + THINK_OPEN + "inner" + THINK_CLOSE),
  ]
  const context = buildGenerationContext("bone ring", [], messages)
  assert.ok(context && context.kind === "chat")
  const user = buildGeneratorUserMessage("bone ring", "inventory", context)
  assert.ok(user.includes("[DM] A bone ring, pale as moonlight."))
  assert.ok(user.includes("[You] Open the chest."))
  assert.ok(!user.includes(LOOT_BLOCK_LANG))
  assert.ok(!user.includes("inner"))
})

test("plain message (no context): canonical wording, full rarity list, quantity only for inventory", () => {
  const inventory = buildGeneratorUserMessage("Sword", "inventory", null)
  assert.ok(inventory.includes("canonical details"))
  for (const rung of GENERATABLE_RARITIES) assert.ok(inventory.includes(rung))
  assert.ok(inventory.includes('"quantity"'))

  const equipment = buildGeneratorUserMessage("Sword", "equipment", null)
  assert.ok(!/,"quantity"/.test(equipment))
})

test("drift guard: NO app-authored generator wording names a specific ruleset (owner revision 2026-10-30)", () => {
  const ring = entry("A ring of pale, almost translucent bone")
  const candidates = buildGenerationContext("ring of bone", [ring], [])
  const contexts: Array<GenerationContext | null> = [
    { kind: "canonical", entry: ring },
    candidates,
    buildGenerationContext("unrelated zzz", [], [msg("assistant", "A bone ring!") as ChatMessage]),
    null,
  ]
  for (const context of contexts) {
    const { system, user } = buildGeneratorMessages({
      name: "Bone Ring",
      type: "inventory",
      context,
      campaignPrompt: "Your own campaign house rules.",
    })
    const combined = system + "\n" + user
    // new RegExp + concatenation: a literal "/" inside a regex literal would terminate it.
    const rulesetPattern = new RegExp("5th" + "\\s+" + "edition|fifth" + "\\s+" + "edition|/" + "\\b5e\\b", "i")
    assert.ok(!rulesetPattern.test(combined), "ruleset wording leaked: " + combined.slice(0, 200))
  }
})

test("buildGeneratorMessages: user gets the typed name; system carries the campaign prompt (or not)", () => {
  const withPrompt = buildGeneratorMessages({ name: "  Bone Ring ", type: "inventory", context: null, campaignPrompt: "Grim tone GM." })
  assert.ok(withPrompt.user.includes('"Bone Ring"'))
  assert.ok(withPrompt.system.includes("Grim tone GM."))

  const bare = buildGeneratorMessages({ name: "Bone Ring", type: "inventory", context: null, campaignPrompt: "" })
  assert.ok(bare.system.includes("item detail generator"))
  assert.ok(!bare.system.includes("Grim tone"))
})
