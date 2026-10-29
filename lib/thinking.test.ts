import test from "node:test"
import assert from "node:assert/strict"

import { splitThinkBlocks } from "./thinking"

// Tag spellings are built by concatenation (both the short and long form, the "think"
// family) so the probes never rely on one fixed literal shape.
const LONG_OPEN = "<" + "thinking" + ">"
const LONG_CLOSE = "</" + "thinking" + ">"
const SHORT_OPEN = "<" + "think" + ">"
const SHORT_CLOSE = "</" + "think" + ">"

test("a reply with inline thinking splits into think + text blocks", () => {
  const content = `Before. ${LONG_OPEN}weighing the options…${LONG_CLOSE} After.`
  const blocks = splitThinkBlocks(content)
  assert.equal(blocks.length, 3)
  assert.deepEqual({ type: blocks[0].type, content: blocks[0].content }, { type: "text", content: "Before. " })
  assert.deepEqual({ type: blocks[1].type, content: blocks[1].content }, { type: "think", content: "weighing the options…" })
  assert.deepEqual({ type: blocks[2].type, content: blocks[2].content }, { type: "text", content: " After." })
})

test("the short tag spelling is handled too", () => {
  const blocks = splitThinkBlocks(`x${SHORT_OPEN}inner${SHORT_CLOSE}y`)
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["text", "think", "text"],
  )
  assert.equal(blocks[1].content, "inner")
})

test("multiple thinking segments all render as separate blocks", () => {
  const content = `${LONG_OPEN}a${LONG_CLOSE}mid${SHORT_OPEN}b${SHORT_CLOSE}end`
  const blocks = splitThinkBlocks(content)
  assert.deepEqual(
    blocks.map((b) => [b.type, b.content]),
    [["think", "a"], ["text", "mid"], ["think", "b"], ["text", "end"]],
  )
})

test("a reply without any thinking tag is a single text block", () => {
  const blocks = splitThinkBlocks("Just a plain answer, no tags at all.")
  assert.deepEqual(blocks, [{ type: "text", content: "Just a plain answer, no tags at all." }])
})

test("empty content still yields one (empty) text block", () => {
  assert.deepEqual(splitThinkBlocks(""), [{ type: "text", content: "" }])
})

test("thinking tag casing variants are recognized", () => {
  const upperOpen = "<" + "THINKING" + ">"
  const upperClose = "</" + "THINKING" + ">"
  const blocks = splitThinkBlocks(`${upperOpen}Ruminating…${upperClose}done`)
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["think", "text"],
  )
})

test("thinking content is trimmed of surrounding whitespace", () => {
  const blocks = splitThinkBlocks(`${LONG_OPEN}\n  spaced out  \n${LONG_CLOSE}`)
  assert.equal(blocks[0].content, "spaced out")
})
