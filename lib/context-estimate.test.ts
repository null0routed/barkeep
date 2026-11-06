import test from "node:test"
import assert from "node:assert/strict"

import {
  TOKENS_PER_MESSAGE_OVERHEAD,
  estimateContextTokens,
  estimateTokens,
  formatTokenCount,
} from "./context-estimate"

test("estimateTokens: ~4 chars per token, rounded up, empty is 0", () => {
  assert.equal(estimateTokens(""), 0)
  assert.equal(estimateTokens("abcd"), 1)
  assert.equal(estimateTokens("abcdefgh"), 2)
  assert.equal(estimateTokens("x"), 1) // ceil, never 0 for non-empty
  assert.equal(estimateTokens("x".repeat(41)), 11) // 41/4 = 10.25 → rounded up
})

test("estimateContextTokens: total = system + (overhead + content) per message", () => {
  const system = "s".repeat(40) // 10 tokens
  const a = { content: "m".repeat(80) } // 20 tokens
  const b = { content: "n".repeat(40) } // 10 tokens
  const est = estimateContextTokens(system, [a, b])

  assert.equal(est.systemTokens, 10)
  assert.equal(est.messageTokens, 2 * TOKENS_PER_MESSAGE_OVERHEAD + 20 + 10)
  assert.equal(est.total, est.systemTokens + est.messageTokens)
})

test("estimateContextTokens: zero messages is just the system size", () => {
  const est = estimateContextTokens("a".repeat(400), []) // 100 tokens
  assert.equal(est.systemTokens, 100)
  assert.equal(est.messageTokens, 0)
  assert.equal(est.total, 100)
})

test("formatTokenCount: compact K/M, whole numbers stay plain", () => {
  assert.equal(formatTokenCount(0), "0")
  assert.equal(formatTokenCount(850), "850")
  assert.equal(formatTokenCount(1000), "1K")
  assert.equal(formatTokenCount(1500), "1.5K")
  assert.equal(formatTokenCount(4230), "4.2K")
  assert.equal(formatTokenCount(150_000), "150K")
  assert.equal(formatTokenCount(1_000_000), "1M")
  assert.equal(formatTokenCount(1_234_000), "1.2M")
})
