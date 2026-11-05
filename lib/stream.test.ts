import test from "node:test"
import assert from "node:assert/strict"

import {
  accumulateToolCalls,
  finalizeToolCalls,
  iterateStream,
  parseDataLine,
  parseToolArgs,
  type SseLine,
  type ToolCallAcc,
} from "./stream"

// Build an in-memory text/event-stream body from lines (each gets a trailing newline), so we
// can exercise the SSE reader exactly as the browser would deliver it.
function sseStream(...lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = lines.map((line) => encoder.encode(line + "\n"))
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = []
  for await (const value of iterateStream(body)) out.push(value)
  return out
}

test("parseDataLine parses a JSON payload after the data: prefix", () => {
  const result = parseDataLine('data: {"id":"1"}') as SseLine
  assert.equal(result.type, "data")
  assert.deepEqual((result as { value: unknown }).value, { id: "1" })
})

test("parseDataLine tolerates extra whitespace after the colon", () => {
  const result = parseDataLine('data:    {"a": 1}') as SseLine
  assert.equal(result.type, "data")
  assert.deepEqual((result as { value: unknown }).value, { a: 1 })
})

test("parseDataLine reports the [DONE] sentinel", () => {
  assert.deepEqual(parseDataLine("data: [DONE]"), { type: "done" })
})

test("parseDataLine skips blank, comment, and non-data SSE fields", () => {
  assert.deepEqual(parseDataLine(""), { type: "skip" })
  assert.deepEqual(parseDataLine("   "), { type: "skip" })
  assert.deepEqual(parseDataLine(": keepalive"), { type: "skip" })
  assert.deepEqual(parseDataLine("event: message"), { type: "skip" })
  assert.deepEqual(parseDataLine("id: 7"), { type: "skip" })
  assert.deepEqual(parseDataLine("retry: 3000"), { type: "skip" })
})

test("parseDataLine skips a data: line with an empty payload", () => {
  assert.deepEqual(parseDataLine("data:"), { type: "skip" })
  assert.deepEqual(parseDataLine("data:   "), { type: "skip" })
})

function acc(): Map<number, ToolCallAcc> {
  return new Map()
}

test("accumulateToolCalls folds a single fragment", () => {
  const m = accumulateToolCalls(acc(), [
    { index: 0, id: "call_1", function: { name: "getCharacterSheet", arguments: "{}" } },
  ])
  assert.equal(m.size, 1)
  assert.deepEqual([...m.values()][0], {
    id: "call_1",
    name: "getCharacterSheet",
    arguments: "{}",
  })
})

test("accumulateToolCalls concatenates name/arguments across fragments and keeps the first id", () => {
  const m = acc()
  accumulateToolCalls(m, [{ index: 0, id: "call_9", function: { name: "get" } }])
  accumulateToolCalls(m, [{ index: 0, function: { name: "Character", arguments: '{"a":' } }])
  accumulateToolCalls(m, [{ index: 0, id: "call_9", function: { arguments: '1}' } }])
  const entry = m.get(0)
  assert.ok(entry)
  assert.equal(entry.id, "call_9")
  assert.equal(entry.name, "getCharacter")
  assert.equal(entry.arguments, '{"a":1}')
})

test("accumulateToolCalls keeps independent calls in separate index buckets", () => {
  const m = acc()
  accumulateToolCalls(m, [{ index: 0, id: "a", function: { name: "save" } }])
  accumulateToolCalls(m, [{ index: 1, id: "b", function: { name: "get" } }])
  accumulateToolCalls(m, [{ index: 0, function: { name: "Campaign" } }])
  const finalized = finalizeToolCalls(m)
  assert.equal(finalized.length, 2)
  assert.deepEqual(
    finalized.map((tc) => ({ id: tc.id, name: tc.function.name })),
    [
      { id: "a", name: "saveCampaign" },
      { id: "b", name: "get" },
    ],
  )
})

test("accumulateToolCalls ignores non-array and malformed fragments", () => {
  const m = acc()
  accumulateToolCalls(m, "not an array")
  accumulateToolCalls(m, [null, 42, { function: { name: "x" } }])
  assert.equal(m.size, 1)
  assert.deepEqual(finalizeToolCalls(m), [
    { id: "", type: "function", function: { name: "x", arguments: "" } },
  ])
})

test("iterateStream yields parsed chunks and stops at [DONE]", async () => {
  const body = sseStream(
    'data: {"n":1}',
    "event: message",
    ": keepalive",
    'data: {"n":2}',
    "data: [DONE]",
    "data: {\"should\":\"never appear\"}",
  )
  const values = await collect(body)
  assert.deepEqual(values, [{ n: 1 }, { n: 2 }])
})

test("iterateStream tolerates a line split across chunk boundaries", async () => {
  const encoder = new TextEncoder()
  // One `data:` line whose bytes are delivered in three fragments, plus a second complete line.
  const a = encoder.encode('data: {"part":')
  const b = encoder.encode('"hel')
  const c = encoder.encode('lo"}\n')
  const d = encoder.encode('data: {"n":9}\n')
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(a)
      controller.enqueue(b)
      controller.enqueue(c)
      controller.enqueue(d)
      controller.close()
    },
  })
  const values = await collect(body)
  assert.deepEqual(values, [{ part: "hello" }, { n: 9 }])
})

test("iterateStream handles a trailing line without a newline", async () => {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("data: {\"tail\":true}"))
      controller.close()
    },
  })
  const values = await collect(body)
  assert.deepEqual(values, [{ tail: true }])
})

test("iterateStream yields nothing for an empty body", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
  assert.deepEqual(await collect(body), [])
})

// ---------------------------------------------------------------------------
// parseToolArgs (TODO.MD #9.2 — reading the generateImage prompt/alt)
// ---------------------------------------------------------------------------

test("parseToolArgs parses a JSON arguments string", () => {
  assert.deepEqual(parseToolArgs('{"prompt":"a tavern","alt":"The tavern"}'), {
    prompt: "a tavern",
    alt: "The tavern",
  })
})

test("parseToolArgs passes through an already-parsed object", () => {
  assert.deepEqual(parseToolArgs({ prompt: "a forest" }), { prompt: "a forest" })
})

test("parseToolArgs returns {} for malformed JSON (never throws)", () => {
  assert.deepEqual(parseToolArgs("{not json"), {})
  assert.deepEqual(parseToolArgs(""), {})
})

test("parseToolArgs returns {} for non-object values", () => {
  assert.deepEqual(parseToolArgs(null), {})
  assert.deepEqual(parseToolArgs(42), {})
  assert.deepEqual(parseToolArgs("just a string"), {})
  assert.deepEqual(parseToolArgs('"quoted"'), {}) // valid JSON but not an object
  assert.deepEqual(parseToolArgs(undefined), {})
})
