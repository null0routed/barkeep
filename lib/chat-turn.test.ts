import test from "node:test"
import assert from "node:assert/strict"

import {
  buildStats,
  extractThinking,
  isAbortError,
  mergeUsage,
  statsLines,
  toAssistantTurn,
  type ApiUsage,
} from "./chat-turn"

test("extractThinking returns the structured reasoning field when it is text", () => {
  assert.equal(extractThinking({ reasoning: "Let me think…" }), "Let me think…")
})

test("extractThinking falls back to reasoning_content (gateway style)", () => {
  assert.equal(extractThinking({ reasoning_content: "hmm" }), "hmm")
})

test("extractThinking prefers `reasoning` when both fields exist", () => {
  assert.equal(extractThinking({ reasoning: "a", reasoning_content: "b" }), "a")
})

test("extractThinking ignores empty, whitespace-only, and non-string values", () => {
  assert.equal(extractThinking({ reasoning: "" }), undefined)
  assert.equal(extractThinking({ reasoning: "   \n" }), undefined)
  assert.equal(extractThinking({ reasoning: 42 }), undefined)
  assert.equal(extractThinking({}), undefined)
  assert.equal(extractThinking(null), undefined)
  assert.equal(extractThinking("a string message"), undefined)
  assert.equal(extractThinking(undefined), undefined)
})

test("mergeUsage sums matching fields across two legs of a tool round-trip", () => {
  const merged = mergeUsage(
    { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 },
  )
  assert.deepEqual(merged, { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 })
})

test("mergeUsage tolerates undefined legs and missing sub-fields", () => {
  assert.deepEqual(mergeUsage(undefined, undefined), undefined)
  assert.deepEqual(mergeUsage({ prompt_tokens: 3 }, undefined), {
    prompt_tokens: 3,
    completion_tokens: undefined,
    total_tokens: undefined,
  })
  // total derived from the two halves when the endpoint did not report it
  assert.deepEqual(mergeUsage({ prompt_tokens: 2, completion_tokens: 3 }, undefined), {
    prompt_tokens: 2,
    completion_tokens: 3,
    total_tokens: 5,
  })
  // non-finite values are ignored, not propagated
  assert.deepEqual(
    mergeUsage({ prompt_tokens: Number.NaN }, { prompt_tokens: 1 }),
    { prompt_tokens: 1, completion_tokens: undefined, total_tokens: undefined },
  )
})

test("buildStats maps usage + timing into TurnStats", () => {
  const startedAt = Date.now() - 1000
  const usage: ApiUsage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
  const stats = buildStats(usage, startedAt, 7)
  assert.equal(stats.promptTokens, 100)
  assert.equal(stats.completionTokens, 50)
  assert.equal(stats.totalTokens, 150)
  assert.equal(stats.contextMessages, 7)
  assert.ok(stats.elapsedMs >= 999 && stats.elapsedMs < 5000)
  assert.ok(stats.tokensPerSecond !== undefined && stats.tokensPerSecond > 20 && stats.tokensPerSecond < 100)
  assert.equal(stats.aborted, false)
})

test("buildStats keeps token fields undefined when the endpoint reported no usage", () => {
  const stats = buildStats(undefined, Date.now() - 100, 0)
  assert.equal(stats.promptTokens, undefined)
  assert.equal(stats.completionTokens, undefined)
  assert.equal(stats.totalTokens, undefined)
  assert.equal(stats.tokensPerSecond, undefined)
  assert.equal(stats.contextMessages, 0)
  assert.ok(stats.elapsedMs >= 100)
})

test("buildStats honors the aborted flag", () => {
  const stats = buildStats(undefined, Date.now(), 1, true)
  assert.equal(stats.aborted, true)
})

test("toAssistantTurn normalizes a provider message and keeps thinking separate", () => {
  const turn = toAssistantTurn(
    { content: "Roll for initiative.", reasoning: "The player should roll first." },
    { prompt_tokens: 10, completion_tokens: 2 },
    Date.now() - 50,
    3,
  )
  assert.equal(turn.content, "Roll for initiative.")
  assert.equal(turn.thinking, "The player should roll first.")
  assert.equal(turn.stats.contextMessages, 3)
})

test("toAssistantTurn degrades safely for malformed messages", () => {
  assert.equal(toAssistantTurn(undefined, undefined, Date.now(), 1).content, "")
  assert.equal(toAssistantTurn({ content: 123 }, undefined, Date.now(), 1).content, "")
  assert.equal(toAssistantTurn({ content: "ok" }, undefined, Date.now(), 1).thinking, undefined)
})

test("isAbortError distinguishes user aborts from real failures", () => {
  assert.equal(isAbortError(new DOMException("The user aborted a request.", "AbortError")), true)
  assert.equal(isAbortError(new Error("AbortError by name only on other types")), false)
  const plain = new Error("boom")
  plain.name = "AbortError"
  assert.equal(isAbortError(plain), true) // name is what browsers set; both are aborts
  assert.equal(isAbortError("abort string"), false)
  assert.equal(isAbortError(null), false)
})

test("statsLines renders present fields and skips absent ones", () => {
  const full = statsLines({
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    contextMessages: 2,
    elapsedMs: 1000,
    tokensPerSecond: 5,
  })
  const labels = full.map((line) => line.label)
  assert.deepEqual(labels, ["Context", "Tokens in", "Tokens out", "Total tokens", "Speed", "Duration"])
  assert.equal(full[0].value, "2 messages")

  const minimal = statsLines({ contextMessages: 1, elapsedMs: 500 })
  assert.deepEqual(minimal.map((line) => line.label), ["Context", "Duration"])
  assert.equal(minimal[0].value, "1 message")
})

test("statsLines notes a user-stopped turn", () => {
  const lines = statsLines({ contextMessages: 1, elapsedMs: 500, aborted: true })
  assert.deepEqual(lines[lines.length - 1], { label: "Status", value: "stopped by user" })
})
