/**
 * Helpers for streaming from an OpenAI-compatible `chat/completions` endpoint
 * (TODO.MD #3.6). The pure functions here are unit-tested in lib/stream.test.ts; the
 * SSE reader itself is exercised with a small in-memory ReadableStream.
 *
 * A streamed response is a `text/event-stream` body of `data:` lines, each carrying a
 * JSON chunk (a partial completion), terminated by the sentinel `data: [DONE]`. Endpoints
 * that ignore `stream: true` answer with a single JSON document instead — detected by the
 * caller via the response's content-type.
 */

/** One SSE `data:` line, classified after being trimmed/parsed. */
export type SseLine =
  | { type: "data"; value: unknown } // a parsed JSON chunk
  | { type: "done" } // the `data: [DONE]` sentinel — the stream is complete
  | { type: "skip" } // blank line, a keep-alive comment, or another SSE field

/** The terminator some OpenAI-compatible servers emit to end a chat stream. */
const DONE_TOKEN = "[DONE]"

/**
 * Classify a single line of an SSE body (TODO.MD #3.6). Only `data:` lines carry a payload;
 * blank lines, keep-alive comments (`:keepalive`), and the other standard SSE fields
 * (`event:`, `id:`, `retry:`) are skipped. `data: [DONE]` reports the end of the stream.
 * A malformed `data:` payload (invalid JSON) is allowed to throw — the caller surfaces it.
 */
export function parseDataLine(rawLine: string): SseLine {
  const line = rawLine.trim()
  if (line === "") return { type: "skip" }
  const prefix = "data:"
  if (!line.startsWith(prefix)) return { type: "skip" }
  const payload = line.slice(prefix.length).trimStart()
  if (payload === "") return { type: "skip" }
  if (payload === DONE_TOKEN) return { type: "done" }
  return { type: "data", value: JSON.parse(payload) }
}

/** A partially-assembled streaming tool call, keyed by its stream index. */
export interface ToolCallAcc {
  id: string
  name: string
  arguments: string
}

/**
 * Fold one chunk's `delta.tool_calls` array into the running accumulator (TODO.MD #3.6).
 * OpenAI streams a tool call as several fragments addressed by `index`; each fragment may
 * carry an `id` (first non-empty wins), and name/arguments fragments (concatenated in order).
 * Non-array input is ignored, so this is safe to call unconditionally.
 */
export function accumulateToolCalls(
  acc: Map<number, ToolCallAcc>,
  deltaToolCalls: unknown,
): Map<number, ToolCallAcc> {
  if (!Array.isArray(deltaToolCalls)) return acc
  for (const raw of deltaToolCalls) {
    if (typeof raw !== "object" || raw === null) continue
    const tc = raw as Record<string, unknown>
    const index =
      typeof tc.index === "number" && Number.isFinite(tc.index) ? tc.index : 0
    let entry = acc.get(index)
    if (!entry) {
      entry = { id: "", name: "", arguments: "" }
      acc.set(index, entry)
    }
    if (typeof tc.id === "string" && tc.id.length > 0) {
      entry.id = tc.id
    }
    const fn = tc.function
    if (typeof fn === "object" && fn !== null) {
      const fnRec = fn as Record<string, unknown>
      if (typeof fnRec.name === "string") entry.name += fnRec.name
      if (typeof fnRec.arguments === "string") entry.arguments += fnRec.arguments
    }
  }
  return acc
}

/** An OpenAI-compatible tool-call object (the same shape the non-streamed path feeds to handleToolCalls). */
export interface StreamedToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

/** Order the accumulated tool calls by stream index into OpenAI-compatible objects. */
export function finalizeToolCalls(acc: Map<number, ToolCallAcc>): StreamedToolCall[] {
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => ({
      id: entry.id,
      type: "function",
      function: { name: entry.name, arguments: entry.arguments },
    }))
}

/**
 * Parse a tool call's `function.arguments` (a JSON string in the OpenAI shape, or an already
 * parsed object from some proxies) into a plain object. Returns `{}` for any value that does
 * not resolve to an object — it never throws, so malformed model output degrades safely
 * (TODO.MD #9.2: reading the `prompt`/`alt` args of generateImage).
 */
export function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** A coalescing sink for high-frequency streaming updates. */
export interface StreamFlusher {
  /** Record the latest FULL value (not an increment) and schedule its commit on the next tick. */
  push: (value: string) => void
  /** Commit the pending value immediately (turn settlement — never a stale frame after this). */
  flush: () => void
  /** Drop pending work without committing (a turn that failed or was aborted). */
  cancel: () => void
}

/** Opaque handle for a scheduled tick — a `number` for requestAnimationFrame, a `Timeout` for the setTimeout fallback. */
type TickHandle = number | ReturnType<typeof setTimeout>

/**
 * Coalesce a burst of streaming deltas into at most ONE commit per animation frame (T3.1).
 *
 * Without this, callApi's `onDelta` runs on every SSE chunk — and each commit re-parses
 * the bubble's entire markdown (and re-scans loot fences) at chunk rate, i.e. O(n²) per
 * long narration. Deltas are still "freshest wins" (push takes the accumulated value, not
 * an increment), so a burst of N chunks becomes one commit of the last one, ~16 ms
 * later (`requestAnimationFrame` where the platform offers one, else a short
 * `setTimeout`). `flush()` drains pending work synchronously for the turn's final
 * settlement; `cancel()` discards it when the turn fails or is aborted.
 *
 * The tick source is injectable so tests can drive it deterministically; the default
 * pair is (requestAnimationFrame, cancelAnimationFrame) or (setTimeout, clearTimeout).
 */
export function createStreamFlusher(
  commit: (value: string) => void,
  options?: {
    /** Delay for the setTimeout fallback, ms. Default 80. */
    delayMs?: number
    /** Injectable tick source (tests); defaults to requestAnimationFrame/setTimeout. */
    schedule?: (callback: () => void) => TickHandle
    cancel?: (handle: TickHandle) => void
  },
): StreamFlusher {
  const hasRaf = typeof requestAnimationFrame === "function"
  const defaultSchedule = (cb: () => void): TickHandle =>
    hasRaf ? requestAnimationFrame(cb) : setTimeout(cb, options?.delayMs ?? 80)
  const defaultCancel = (handle: TickHandle): void => {
    if (hasRaf) cancelAnimationFrame(handle as number)
    else clearTimeout(handle)
  }
  const schedule = options?.schedule ?? defaultSchedule
  const cancelTick = options?.cancel ?? defaultCancel

  let pending: string | undefined
  let hasPending = false
  let handle: TickHandle | null = null

  const commitPending = (): void => {
    handle = null
    if (!hasPending) return
    hasPending = false
    const value = pending
    pending = undefined
    commit(value as string)
  }

  return {
    push: (value: string) => {
      pending = value
      hasPending = true
      if (handle === null) handle = schedule(commitPending)
    },
    flush: () => {
      if (handle !== null) cancelTick(handle)
      commitPending()
    },
    cancel: () => {
      if (handle !== null) {
        cancelTick(handle)
        handle = null
      }
      hasPending = false
      pending = undefined
    },
  }
}

/**
 * Read an OpenAI-compatible `text/event-stream` body and yield each parsed JSON chunk
 * (TODO.MD #3.6). Stops at the `data: [DONE]` sentinel. The reader is released on
 * completion; if the underlying fetch is aborted, `reader.read()` rejects with an
 * AbortError, which propagates to the caller (see isAbortError in chat-turn).
 */
export async function* iterateStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) buffer += decoder.decode(value, { stream: true })

      // Process every complete line; keep the final (possibly partial) fragment in the buffer.
      let newline: number
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const rawLine = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        const parsed = parseDataLine(rawLine)
        if (parsed.type === "done") return
        if (parsed.type === "data") yield parsed.value
      }
    }

    // Flush any decoded tail that did not end in a newline.
    buffer += decoder.decode()
    if (buffer.trim() !== "") {
      const parsed = parseDataLine(buffer)
      if (parsed.type === "data") yield parsed.value
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // Already released (e.g. mid-abort) — nothing left to do.
    }
  }
}
