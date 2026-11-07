import assert from "node:assert/strict"
import { test } from "node:test"

import {
  CHECKPOINTS_STORAGE_KEY,
  MAX_CHECKPOINTS_STORED,
  extractNewCheckpoints,
  formatCheckpoint,
  formatCheckpoints,
  isCheckpointSaveOnly,
  loadCheckpoints,
  runCheckpointTool,
  sanitizeCheckpoints,
  saveCheckpoints,
} from "./campaign-checkpoints"
import type { CampaignCheckpoint } from "./types"

// ---------------------------------------------------------------------------
// localStorage polyfill: saveCheckpoints/loadCheckpoints talk to window.localStorage
// (the real browser object), so Node gets a minimal stand-in that records writes.
// ---------------------------------------------------------------------------
type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

let store = new Map<string, string>()
let failSet = false

function installWindowStorage() {
  store = new Map()
  failSet = false
  const storage: StorageLike = {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      if (failSet) throw new Error("QuotaExceededError")
      store.set(key, String(value))
    },
  }
  ;(globalThis as unknown as { window?: unknown }).window = { localStorage: storage }
}

function makeCheckpoint(n: number): CampaignCheckpoint {
  return {
    id: `id-${n}`,
    createdAt: new Date(n).toISOString(),
    title: `CP${n}`,
    summary: `Summary ${n}`,
  }
}

const makeMany = (count: number): CampaignCheckpoint[] => Array.from({ length: count }, (_, i) => makeCheckpoint(i + 1))

// ---------------------------------------------------------------------------
// sanitizeCheckpoints — the untrusted-input gate (localStorage *and* import files)
// ---------------------------------------------------------------------------

test("sanitizeCheckpoints: non-arrays and malformed entries yield no checkpoints", () => {
  assert.deepEqual(sanitizeCheckpoints(null), [])
  assert.deepEqual(sanitizeCheckpoints("checkpoints"), [])
  assert.deepEqual(sanitizeCheckpoints({ checkpoints: [] }), [])
  assert.deepEqual(sanitizeCheckpoints([null, 42, "text", 3.14, { title: "no summary" }, { summary: "no title" }, { title: "  ", summary: "x" }]), [])
})

test("sanitizeCheckpoints: keeps valid entries, fills missing id/createdAt, trims", () => {
  const [cp] = sanitizeCheckpoints([{ title: "  Title  ", summary: " text " }])
  assert.ok(cp)
  assert.equal(cp.title, "Title")
  assert.equal(cp.summary, "text")
  assert.ok(cp.id.length > 0)
  assert.ok(cp.createdAt.length > 0)
})

test("sanitizeCheckpoints: keeps existing id/createdAt and non-blank optional fields only", () => {
  const [cp] = sanitizeCheckpoints([
    {
      id: "keep-me",
      createdAt: "2026-01-01T00:00:00.000Z",
      title: "T",
      summary: "S",
      currentLocation: "  Waterdeep  ",
      activeQuests: "   ",
      plotPoints: "",
      npcs: null,
      notes: 42,
    },
  ])
  assert.ok(cp)
  assert.equal(cp.id, "keep-me")
  assert.equal(cp.createdAt, "2026-01-01T00:00:00.000Z")
  assert.equal(cp.currentLocation, "Waterdeep")
  assert.equal(cp.activeQuests, undefined)
  assert.equal(cp.plotPoints, undefined)
  assert.equal(cp.npcs, undefined)
  assert.equal(cp.notes, undefined)
})

test("sanitizeCheckpoints: duplicate ids get replaced with fresh unique ids", () => {
  const [a, b] = sanitizeCheckpoints([
    { id: "same", title: "A", summary: "S" },
    { id: "same", title: "B", summary: "S" },
  ])
  assert.ok(a && b)
  assert.equal(a.id, "same")
  assert.notEqual(b.id, "same")
  assert.notEqual(a.id, b.id)
})

test("sanitizeCheckpoints: over-cap lists are trimmed to the newest MAX_CHECKPOINTS_STORED", () => {
  assert.ok(MAX_CHECKPOINTS_STORED >= 50) // the locked spec value
  const capped = sanitizeCheckpoints(makeMany(MAX_CHECKPOINTS_STORED + 15))
  assert.equal(capped.length, MAX_CHECKPOINTS_STORED)
  // the OLDEST 15 (CP1..CP15) are dropped; the survivors start at CP16
  const total = MAX_CHECKPOINTS_STORED + 15
  assert.equal(capped[0]?.title, `CP${total - MAX_CHECKPOINTS_STORED + 1}`)
  assert.equal(capped[capped.length - 1]?.title, `CP${MAX_CHECKPOINTS_STORED + 15}`)
  assert.ok(!capped.some((cp) => cp.title === "CP1"))
})

// ---------------------------------------------------------------------------
// loadCheckpoints — corrupt-JSON path must degrade to [], never throw
// ---------------------------------------------------------------------------

test("loadCheckpoints: no window (non-browser runtime) yields []", () => {
  assert.deepEqual(loadCheckpoints(), [])
})

test("loadCheckpoints: valid saved list, missing key, corrupt JSON, non-array JSON", () => {
  installWindowStorage()
  const expected = makeMany(2)
  store.set(CHECKPOINTS_STORAGE_KEY, JSON.stringify(expected))
  assert.deepEqual(loadCheckpoints(), expected)

  store.clear()
  assert.deepEqual(loadCheckpoints(), [])

  store.set(CHECKPOINTS_STORAGE_KEY, "{ not json")
  assert.deepEqual(loadCheckpoints(), [])

  store.set(CHECKPOINTS_STORAGE_KEY, JSON.stringify({ not: "an array" }))
  assert.deepEqual(loadCheckpoints(), [])
})

// ---------------------------------------------------------------------------
// saveCheckpoints — ok path and the QuotaExceeded path (result shape is contract)
// ---------------------------------------------------------------------------

test("saveCheckpoints: writes parseable JSON and reports ok", () => {
  installWindowStorage()
  const list = makeMany(3)
  const result = saveCheckpoints(list)
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(JSON.parse(store.get(CHECKPOINTS_STORAGE_KEY)!), list)
})

test("saveCheckpoints: storage failure reports ok:false with the error message", () => {
  installWindowStorage()
  failSet = true
  const failed = saveCheckpoints(makeMany(1))
  assert.equal(failed.ok, false)
  assert.equal(failed.error, "QuotaExceededError")
})

// ---------------------------------------------------------------------------
// formatCheckpoint / formatCheckpoints — exact text the model sees
// ---------------------------------------------------------------------------

test("formatCheckpoint: header + summary first, optional fields in fixed order, blanks skipped", () => {
  const text = formatCheckpoint({
    id: "abc",
    createdAt: "2026-06-01T00:00:00.000Z",
    title: "Arrived",
    summary: "We made dockside.",
    currentLocation: "Port of Tethyr",
    activeQuests: "Recover the ledger",
    plotPoints: "The guild is involved",
    npcs: "Quartermaster Voss",
    notes: "Voss is honest-ish",
  })
  assert.equal(
    text,
    [
      "CHECKPOINT: Arrived [id: abc] (saved 2026-06-01T00:00:00.000Z)",
      "Summary: We made dockside.",
      "Location: Port of Tethyr",
      "Active quests: Recover the ledger",
      "Plot points: The guild is involved",
      "NPCs: Quartermaster Voss",
      "Notes: Voss is honest-ish",
    ].join("\n")
  )

  assert.equal(
    formatCheckpoint(makeCheckpoint(1)),
    ["CHECKPOINT: CP1 [id: id-1] (saved " + new Date(1).toISOString() + ")", "Summary: Summary 1"].join("\n")
  )
})

test("formatCheckpoints: empty list message", () => {
  assert.equal(formatCheckpoints([]), "No campaign checkpoints have been saved yet.")
})

test("formatCheckpoints: newest first, no OLD section under the limit", () => {
  const text = formatCheckpoints(makeMany(2))
  assert.ok(text.startsWith("Showing 2 of 2 saved checkpoints (newest first)."))
  // newest first: CP2's block precedes CP1's
  assert.ok(text.indexOf("CHECKPOINT: CP2") < text.indexOf("CHECKPOINT: CP1"))
  assert.ok(!text.includes("OLDER CHECKPOINTS"))
})

test("formatCheckpoints: OLD section indexes the remainder (up to 20 entries)", () => {
  const ten = formatCheckpoints(makeMany(5), 2)
  assert.ok(ten.startsWith("Showing 2 of 5 saved checkpoints (newest first)."))
  assert.ok(ten.includes("OLDER CHECKPOINTS (fetch one by id):"))
  assert.ok(ten.includes("CHECKPOINT: CP5"))
  assert.ok(ten.includes("CHECKPOINT: CP4"))
  for (const n of [3, 2, 1]) assert.ok(ten.includes(`- CP${n} [id: id-${n}]`))
  assert.ok(!ten.includes("older not listed"))

  const many = formatCheckpoints(makeMany(25))
  assert.ok(many.startsWith("Showing 3 of 25 saved checkpoints (newest first)."))
  assert.equal((many.match(/^- CP\d+ \[id:/gm) ?? []).length, 20)
  assert.ok(many.includes("(+2 older not listed)"))
})

// ---------------------------------------------------------------------------
// runCheckpointTool — the AI-facing contract (names, errors, state agreement)
// ---------------------------------------------------------------------------

test("runCheckpointTool: unknown tool names return null so the caller can fall through", () => {
  assert.equal(runCheckpointTool("deleteEverything", "{}", []), null)
})

test("runCheckpointTool(save): bad arguments and missing fields change nothing", () => {
  installWindowStorage()
  const current = makeMany(1)

  const badJson = runCheckpointTool("saveCampaignCheckpoint", "{definitely not json", current)
  assert.ok(badJson)
  assert.match(badJson.content, /not valid JSON\. Nothing was changed/)
  assert.equal(badJson.checkpoints, current)

  const missing = runCheckpointTool("saveCampaignCheckpoint", { title: "T" }, current)
  assert.ok(missing)
  assert.match(missing.content, /both 'title' and 'summary' are required\. Nothing was saved/)
  assert.equal(missing.checkpoints, current)
  assert.equal(store.get(CHECKPOINTS_STORAGE_KEY) ?? "", "")
})

test("runCheckpointTool(save): appends and persists only on success", () => {
  installWindowStorage()
  const current = makeMany(2)

  const ok = runCheckpointTool("saveCampaignCheckpoint", JSON.stringify({ title: "New", summary: "It happened" }), current)
  assert.ok(ok)
  assert.match(ok.content, /Checkpoint saved: "New" \[id: [^\]]+\]\. Total checkpoints: 3\./)
  assert.notEqual(ok.checkpoints, current)
  assert.equal(ok.checkpoints.length, 3)
  assert.equal(ok.checkpoints[2]!.title, "New")
  assert.deepEqual(JSON.parse(store.get(CHECKPOINTS_STORAGE_KEY)!), ok.checkpoints)

  // storage failing must leave the in-memory list untouched (state agreement)
  failSet = true
  const failed = runCheckpointTool("saveCampaignCheckpoint", { title: "X", summary: "Y" }, ok.checkpoints)
  assert.ok(failed)
  assert.match(failed.content, /could not be saved to browser storage/)
  assert.equal(failed.checkpoints, ok.checkpoints)
})

test("runCheckpointTool(save): a full store prunes the oldest and tells the model", () => {
  installWindowStorage()
  const full = makeMany(MAX_CHECKPOINTS_STORED)

  const ok = runCheckpointTool("saveCampaignCheckpoint", { title: "Latest", summary: "End of the arc" }, full)
  assert.ok(ok)
  assert.equal(ok.checkpoints.length, MAX_CHECKPOINTS_STORED)
  assert.equal(ok.checkpoints[MAX_CHECKPOINTS_STORED - 1]?.title, "Latest")
  assert.ok(!ok.checkpoints.some((cp) => cp.title === "CP1"))
  assert.match(ok.content, new RegExp(`Total checkpoints: ${MAX_CHECKPOINTS_STORED}\\.`))
  assert.match(ok.content, /oldest were pruned/)
  assert.deepEqual(JSON.parse(store.get(CHECKPOINTS_STORAGE_KEY)!), ok.checkpoints)
})

test("runCheckpointTool(get): by id, unknown id, and limit clamping", () => {
  installWindowStorage()
  const twelve = makeMany(12)
  const target = twelve[5]!

  const found = runCheckpointTool("getCampaignCheckpoints", JSON.stringify({ id: target.id }), twelve)
  assert.ok(found)
  assert.equal(found.content, formatCheckpoint(target))
  assert.equal(found.checkpoints, twelve)

  const missing = runCheckpointTool("getCampaignCheckpoints", { id: "nope" }, twelve)
  assert.ok(missing)
  assert.ok(missing.content.startsWith('No checkpoint found with id "nope".'))

  const big = runCheckpointTool("getCampaignCheckpoints", { limit: 99 }, twelve)
  assert.ok(big && big.content.startsWith("Showing 10 of 12 saved checkpoints (newest first)."))

  const zero = runCheckpointTool("getCampaignCheckpoints", { limit: 0 }, twelve)
  assert.ok(zero && zero.content.startsWith("Showing 1 of 12 saved checkpoints (newest first)."))

  const defaulted = runCheckpointTool("getCampaignCheckpoints", {}, twelve)
  assert.ok(defaulted && defaulted.content.startsWith("Showing 3 of 12 saved checkpoints (newest first)."))
})

// ---------------------------------------------------------------------------
// isCheckpointSaveOnly — the "skip the follow-up leg" decision
// ---------------------------------------------------------------------------

test("isCheckpointSaveOnly: true only when EVERY call is saveCampaignCheckpoint", () => {
  const save = { id: "t1", type: "function" as const, function: { name: "saveCampaignCheckpoint", arguments: "{}" } }
  const get = { id: "t2", type: "function" as const, function: { name: "getCampaignCheckpoints", arguments: "{}" } }
  const sheet = { id: "t3", type: "function" as const, function: { name: "getCharacterSheet", arguments: "{}" } }

  assert.equal(isCheckpointSaveOnly([save]), true)
  assert.equal(isCheckpointSaveOnly([save, save]), true)

  // any other tool in the leg means the follow-up is still needed (its results build the answer)
  assert.equal(isCheckpointSaveOnly([save, get]), false)
  assert.equal(isCheckpointSaveOnly([get, save]), false)
  assert.equal(isCheckpointSaveOnly([save, sheet]), false)
  assert.equal(isCheckpointSaveOnly([get]), false)
  assert.equal(isCheckpointSaveOnly([]), false)

  // malformed entries must not count as checkpoint saves
  assert.equal(isCheckpointSaveOnly([undefined]), false)
  assert.equal(isCheckpointSaveOnly([{ id: "t4" }]), false)
  assert.equal(isCheckpointSaveOnly([{ id: "t5", function: { name: "saveCampaignCheckpoint" } }]), true)
})

// ---------------------------------------------------------------------------
// extractNewCheckpoints — the "badge the turn with what it stored" diff
// ---------------------------------------------------------------------------

test("extractNewCheckpoints: returns only the appended entries, in save order", () => {
  const before = makeMany(3)
  const addedOne = makeCheckpoint(101)
  const addedTwo = makeCheckpoint(102)
  const after = [...before, addedOne, addedTwo]

  assert.deepEqual(extractNewCheckpoints(before, after), [addedOne, addedTwo])
  assert.deepEqual(extractNewCheckpoints(after, after), [])
  assert.deepEqual(extractNewCheckpoints([], after), after)

  // a same-id change (not an append) is NOT new
  const swapped = [...before.slice(0, 2), { ...before[2]!, summary: "updated" }]
  assert.deepEqual(extractNewCheckpoints(before, swapped), [])

  // appending under the cap prunes the OLDEST — the diff still sees only the new one
  const pruned = [...before.slice(1), addedOne]
  assert.deepEqual(extractNewCheckpoints(before, pruned), [addedOne])
})
