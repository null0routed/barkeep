import test from "node:test"
import assert from "node:assert/strict"

import {
  MAX_COMPACT_PASSES,
  MIN_COMPACTABLE_MESSAGES,
  applyCalibration,
  buildCompactionRequest,
  estimateMessageTokens,
  fitsWindowStart,
  formatTranscriptForCompaction,
  nextCalibration,
  planCompaction,
  sanitizeCompactionSettings,
  summaryWordBudget,
  DEFAULT_COMPACTION_SETTINGS,
} from "./compaction"

test("sanitizeCompactionSettings: garbage in → defaults out", () => {
  assert.deepEqual(sanitizeCompactionSettings(undefined), DEFAULT_COMPACTION_SETTINGS)
  assert.deepEqual(sanitizeCompactionSettings("nonsense"), DEFAULT_COMPACTION_SETTINGS)
  assert.deepEqual(sanitizeCompactionSettings({}), DEFAULT_COMPACTION_SETTINGS)
})

test("sanitizeCompactionSettings: clamps out-of-range values and keeps valid ones", () => {
  const s = sanitizeCompactionSettings({
    enabled: false,
    ceilingTokens: 999_999,
    compactTargetTokens: 1_000,
    keepMessages: 0.5,
  })
  assert.equal(s.enabled, false)
  assert.equal(s.ceilingTokens, 128_000)
  assert.equal(s.compactTargetTokens, 4_000)
  assert.equal(s.keepMessages, 2)
  // target is capped at the ceiling (compacting above it would be a no-op)
  const s2 = sanitizeCompactionSettings({ ceilingTokens: 16_000, compactTargetTokens: 96_000 })
  assert.equal(s2.compactTargetTokens, 16_000)
})

test("applyCalibration scales, clamps, and degrades safely", () => {
  assert.equal(applyCalibration(1000, 2), 2000)
  assert.equal(applyCalibration(1000, 0.1), 500) // clamped to ≥ 0.5
  assert.equal(applyCalibration(1000, 99), 3000) // clamped to ≤ 3
  assert.equal(applyCalibration(1000, NaN), 1000)
  assert.equal(applyCalibration(NaN, 2), 0)
  assert.equal(applyCalibration(-5, 2), 0)
})

test("nextCalibration: learns the ratio, smooths it, and ignores bad observations", () => {
  const first = nextCalibration(null, 1000, 1500)
  assert.equal(first, 1.5)
  // EMA toward a new observation, not a jump
  const second = nextCalibration(first, 1000, 2000)
  assert.ok(second > first && second < 2)
  // invalid observations leave the prior untouched
  assert.equal(nextCalibration(1.5, 0, 1500), 1.5)
  assert.equal(nextCalibration(1.5, 1000, -1), 1.5)
  assert.equal(nextCalibration(null, 0, 0), 1)
})

test("estimateMessageTokens adds the per-message overhead on top of the content", () => {
  // 400 chars / 4 = 100 content tokens + 4 overhead
  assert.equal(estimateMessageTokens("a".repeat(400)), 104)
  assert.equal(estimateMessageTokens(""), 4)
})

test("fitsWindowStart sends the largest suffix that fits, always keeping the newest", () => {
  const tokens = [100, 100, 100, 100]
  // budget 204 → newest two fit (104 + 100), oldest two don't
  assert.equal(fitsWindowStart(tokens, 0, 204), 2)
  // zero budget → still sends the newest message
  assert.equal(fitsWindowStart(tokens, 0, 0), 3)
  // empty history
  assert.equal(fitsWindowStart([], 5, 50), 0)
  // summary eats into the budget
  assert.equal(fitsWindowStart(tokens, 150, 204), 3)
})

test("fitsWindowStart honors the minStart floor", () => {
  const tokens = [10, 10, 10, 10, 10]
  // everything fits, but minStart 3 forces the tail to start no earlier than 3
  assert.equal(fitsWindowStart(tokens, 0, 1000, 3), 3)
  // budget only fits the newest two, and the floor sits below that → the budget wins,
  // but the window may never start BEFORE the floor
  assert.equal(fitsWindowStart(tokens, 0, 25, 2), 3)
  // floor strictly below what fits: the floor pins the start
  assert.equal(fitsWindowStart(tokens, 0, 25, 4), 4)
})

test("planCompaction: no overflow → no passes, just a budget-fit window", () => {
  const plan = planCompaction({
    messageTokens: [100, 200, 300],
    summaryTokens: 0,
    systemTokens: 1000,
    ceilingTokens: 10_000,
    compactTargetTokens: 5000,
    keepMessages: 10,
  })
  assert.deepEqual(plan.passes, [])
  assert.equal(plan.sendsFrom, 0)
  assert.equal(plan.compactableCount, 0)
})

test("planCompaction: overflow with enough history → folds oldest, sends the kept tail", () => {
  // 40 × 500 tokens = 20K raw; ceiling 8K, system 2K → budget 6K; keep 10 (5K tail)
  // makes the 4K target unreachable — priority is ceiling > keep-floor > target.
  const messageTokens = Array.from({ length: 40 }, () => 500)
  const plan = planCompaction({
    messageTokens,
    summaryTokens: 0,
    systemTokens: 2000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 10,
  })
  // exactly one floor-bounded pass: the 4 oldest go into the summary…
  assert.deepEqual(plan.passes, [{ from: 0, to: 4 }])
  // …and the send window is exactly the kept tail (newest 10, 5K)
  assert.equal(plan.sendsFrom, 30)
  assert.equal(messageTokens.length - plan.sendsFrom, 10)
  // total = system 2K + summary 1K (0.5 × 2K folded) + tail 5K = the ceiling
  assert.equal(plan.projectedTotal, 8000)
})

test("planCompaction: short history (below the minimum) is never compacted", () => {
  const plan = planCompaction({
    messageTokens: [5000, 5000], // two huge messages, but only 2 raw
    summaryTokens: 0,
    systemTokens: 1000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 1,
  })
  assert.deepEqual(plan.passes, [])
  assert.ok(plan.sendsFrom >= 1) // the newest message is always sent
})

test("planCompaction: force lowers the minimum for a short session", () => {
  const plan = planCompaction({
    messageTokens: [500, 500, 500, 500], // 4 raw, keep 2 → 2 compactable
    summaryTokens: 0,
    systemTokens: 1000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 2,
    force: true,
  })
  assert.equal(plan.passes.length, 1)
  assert.deepEqual(plan.passes[0], { from: 0, to: 2 })
  assert.equal(plan.sendsFrom, 2)
})

test("planCompaction: force on a very short session has nothing to compact", () => {
  const plan = planCompaction({
    messageTokens: [500, 500],
    summaryTokens: 0,
    systemTokens: 1000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 1,
    force: true,
  })
  assert.deepEqual(plan.passes, [])
  assert.ok(plan.sendsFrom <= 1)
})

test("planCompaction: a big backlog is floor-bounded — one pass per event, capped", () => {
  // 120 × 500 = 60K of raw history vs an 8K ceiling where the kept tail (10 × 500 = 5K)
  // plus one summary pass already fills the budget: further folding would evict the
  // kept tail (floor > target), so exactly one pass lands and the rest stays for
  // future events (the caller's coverage boundary advances with each pass).
  const messageTokens = Array.from({ length: 120 }, () => 500)
  const plan = planCompaction({
    messageTokens,
    summaryTokens: 0,
    systemTokens: 2000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 10,
  })
  assert.ok(plan.passes.length >= 1 && plan.passes.length <= MAX_COMPACT_PASSES)
  // passes are contiguous from index 0 and end before the kept tail
  assert.equal(plan.passes[0].from, 0)
  const last = plan.passes[plan.passes.length - 1]
  assert.ok(last.to <= 110)
  // the send window is the kept tail, and the total is bounded by the ceiling
  assert.equal(plan.sendsFrom, 110)
  assert.equal(plan.projectedTotal, 8000)
})

test("planCompaction: a summary already over the budget is not (and cannot be) folded further", () => {
  // 10K summary + 6K budget: the kept tail (5 × 500) does not fit next to the summary,
  // so the window is at its floor — compaction would only evict kept messages, so it stops.
  const messageTokens = Array.from({ length: 20 }, () => 500)
  const plan = planCompaction({
    messageTokens,
    summaryTokens: 10_000,
    systemTokens: 2000,
    ceilingTokens: 8000,
    compactTargetTokens: 4000,
    keepMessages: 5,
  })
  assert.deepEqual(plan.passes, [])
  // the newest message is still sent (an empty turn is never offered)
  assert.equal(plan.sendsFrom, 19)
})

test("planCompaction: the kept tail survives even when it overshoots the target", () => {
  // 20 × 1000 = 20K for a tail that should be ~10 messages: target 12K, but the
  // floor (summary 0 + keep tail 10K) makes the target unreachable — budget wins.
  const messageTokens = Array(30).fill(1000)
  const plan = planCompaction({
    messageTokens,
    summaryTokens: 0,
    systemTokens: 1000,
    ceilingTokens: 16_000,
    compactTargetTokens: 12_000,
    keepMessages: 10,
    force: true,
  })
  // the newest 10 messages are still in the window it sends
  assert.ok(plan.sendsFrom <= 20, `expected window start ≤ 20, got ${plan.sendsFrom}`)
})

test("buildCompactionRequest: carries the existing summary in, names the chunk out", () => {
  const req = buildCompactionRequest("The party is in Waterdeep.", "PLAYER: We head north.\nDM: A map appears.", 400)
  assert.match(req.system, /running summary/i)
  assert.match(req.system, /LOCATION & TIME/)
  assert.match(req.system, /COMBAT/)
  assert.match(req.system, /within 400 words/)
  assert.match(req.system, /ONLY the updated summary text/)
  assert.match(req.user, /EXISTING SUMMARY:/)
  assert.match(req.user, /The party is in Waterdeep\./)
  assert.match(req.user, /NEW TRANSCRIPT:/)
  assert.match(req.user, /PLAYER: We head north\./)
})

test("buildCompactionRequest: a null existing summary reads as a fresh start", () => {
  const req = buildCompactionRequest(null, "PLAYER: hi", 300)
  assert.match(req.user, /\(none — start a fresh summary\)/)
  // whitespace-only existing summary also reads as fresh
  const blank = buildCompactionRequest("   \n", "PLAYER: hi", 300)
  assert.match(blank.user, /\(none — start a fresh summary\)/)
})

test("summaryWordBudget floors at 200, scales with the slot, and caps at MAX_SUMMARY_WORDS", () => {
  assert.equal(summaryWordBudget(0), 200)
  assert.equal(summaryWordBudget(-10), 200)
  assert.equal(summaryWordBudget(100), 200) // 75 → floored
  assert.equal(summaryWordBudget(1000), 750)
  assert.equal(summaryWordBudget(4000), 2000) // 3000 → capped (output-limit protection)
})

test("formatTranscriptForCompaction: PLAYER/DM labels, empties dropped, order kept", () => {
  const out = formatTranscriptForCompaction([
    { role: "user", content: "  roll attack  " },
    { role: "assistant", content: "" },
    { role: "assistant", content: "You hit." },
    { role: "tool", content: "skipped" },
  ])
  assert.equal(out, "PLAYER: roll attack\n\nDM: You hit.\n\nDM: skipped")
})

test("MIN_COMPACTABLE_MESSAGES and the force threshold are exported for callers/toasts", () => {
  assert.equal(MIN_COMPACTABLE_MESSAGES, 4)
})
