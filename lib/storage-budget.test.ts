import assert from "node:assert/strict"
import { test } from "node:test"

import {
  APP_STORAGE_KEYS,
  STORAGE_SAFE_WATERMARK_BYTES,
  STORAGE_TRIGGER_BYTES,
  formatBytes,
  measureStoredBytes,
  planChatTrim,
  serializedBytes,
} from "./storage-budget"

// ---------------------------------------------------------------------------
// Budget constants — the locked spec itself
// ---------------------------------------------------------------------------

test("budget constants: trigger 4 MB, safe watermark 3.2 MB (80%), hard 5 MB reference", () => {
  assert.equal(STORAGE_TRIGGER_BYTES, 4_000_000)
  assert.equal(STORAGE_SAFE_WATERMARK_BYTES, 3_200_000)
  assert.equal(STORAGE_SAFE_WATERMARK_BYTES, STORAGE_TRIGGER_BYTES * 0.8)
})

test("APP_STORAGE_KEYS: covers every dnd-* key the app writes", () => {
  assert.deepEqual(APP_STORAGE_KEYS, [
    "dnd-character",
    "dnd-chat",
    "dnd-api-url",
    "dnd-api-key",
    "dnd-model",
    "dnd-image-api-url",
    "dnd-image-api-key",
    "dnd-image-model",
    "dnd-image-rate",
    "dnd-image-size",
    "dnd-system-prompt",
    "dnd-max-messages",
    "dnd-campaign-notes",
    "dnd-notes-in-context",
    "dnd-campaign-checkpoints",
    "dnd-loot",
    "dnd-compaction-settings",
    "dnd-conversation-summary",
    "dnd-summary-covers",
    "dnd-context-calibration",
  ])
  assert.equal(new Set(APP_STORAGE_KEYS).size, APP_STORAGE_KEYS.length) // no duplicates
})

// ---------------------------------------------------------------------------
// serializedBytes / formatBytes
// ---------------------------------------------------------------------------

test("serializedBytes: UTF-16 code units × 2 (quota accounting)", () => {
  assert.equal(serializedBytes(""), 0)
  assert.equal(serializedBytes("hi"), 4)
  assert.equal(serializedBytes("日本語"), 6) // 3 code units × 2
})

test("formatBytes: readable units", () => {
  assert.equal(formatBytes(512), "512 B")
  assert.equal(formatBytes(1024), "1 KB")
  assert.equal(formatBytes(812 * 1024), "812 KB")
  assert.equal(formatBytes(3_584_000), "3.4 MB")
  assert.equal(formatBytes(4_000_000), "3.8 MB")
})

// ---------------------------------------------------------------------------
// planChatTrim — the trim decision (pure)
// ---------------------------------------------------------------------------

test("planChatTrim: within trigger, no trim (0)", () => {
  assert.equal(planChatTrim({ baseBytes: 1_000_000, messageBytes: [10_000, 20_000] }), 0)
  // exactly at the trigger is still "within"
  assert.equal(planChatTrim({ baseBytes: 4_000_000 - 30_000, messageBytes: [10_000, 20_000] }), 0)
})

test("planChatTrim: over trigger, drops the minimal prefix that fits under the target", () => {
  // base 3.1 MB + chat 1.0 MB (10 × 100 KB) = 4.1 MB > trigger
  // budget under target = 3.2 MB − 3.1 MB = 100 KB → drop 9, keep 1 × 100 KB
  const messageBytes = Array.from({ length: 10 }, () => 100_000)
  const plan = planChatTrim({ baseBytes: 3_100_000, messageBytes })
  assert.equal(plan, 9)
})

test("planChatTrim: respects oldest-first ordering (drops from the front)", () => {
  // sizes: [1 KB, 1 KB, 2 KB, 4 KB, 4 KB] → total 12 KB
  // base 3_995_000 (total just over the 4 MB trigger) → budget 0 → everything must go → drop all 5
  assert.equal(planChatTrim({ baseBytes: 3_995_000, messageBytes: [1024, 1024, 2048, 4096, 4096] }), 5)

  // base 3_995_000 again with a smaller chat → budget 0 → drop all 3
  // (note: base merely OVER THE TARGET is still under the trigger → correctly no trim)
  assert.equal(planChatTrim({ baseBytes: 3_995_000, messageBytes: [1000, 2000, 3000] }), 3)
  assert.equal(planChatTrim({ baseBytes: 3_200_005, messageBytes: [1000, 2000, 3000] }), 0)
})

test("planChatTrim: base alone over target still reports the full drop (caller fails loudly)", () => {
  const plan = planChatTrim({ baseBytes: 5_000_000, messageBytes: [1000, 1000] })
  assert.equal(plan, 2)
})

test("planChatTrim: custom trigger/target honored", () => {
  // trigger 100, target 40, base 95: total 95+10=105 > 100 → budget = max(0, 40-95)=0 → drop all 2
  assert.equal(planChatTrim({ baseBytes: 95, messageBytes: [5, 5], trigger: 100, target: 40 }), 2)
  // base 30: total 40 ≤ 100 → none
  assert.equal(planChatTrim({ baseBytes: 30, messageBytes: [5, 5], trigger: 100, target: 40 }), 0)
})

// ---------------------------------------------------------------------------
// measureStoredBytes
// ---------------------------------------------------------------------------

test("measureStoredBytes: sums UTF-16×2 over present keys, skips missing", () => {
  const read = (key: string) => ({ a: "ab", b: "cd", c: null } as Record<string, string | null>)[key]
  assert.equal(measureStoredBytes(["a", "b", "c", "missing"], read), 8) // 2+2, c null, missing 0
})

test("measureStoredBytes: a throwing read counts as 0, never throws", () => {
  const read = () => {
    throw new Error("storage disabled")
  }
  assert.equal(measureStoredBytes(["a"], read), 0)
})
