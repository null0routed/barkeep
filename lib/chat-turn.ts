import type { TurnStats } from "./types"

/**
 * One completed assistant turn, normalized from whatever the endpoint returned
 * (TODO.MD #3.4/#3.5). Produced by callApi and consumed by the bubble-rendering
 * helpers in components/chat-interface.tsx.
 */
export interface AssistantTurn {
  content: string
  /** Model thinking text, when the provider surfaced it (undefined otherwise). */
  thinking?: string
  stats: TurnStats
}

/** The OpenAI-compatible `usage` block, as reported by endpoints. */
export interface ApiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/**
 * Extract model thinking from a provider message object (or a streaming delta), when the
 * endpoint surfaces it in a structured field. The provider naming varies — OpenRouter and
 * most gateways use `reasoning`, OpenAI-style `reasoning_content`, Ollama reasoning models
 * use `thinking`. `reasoning` wins if more than one is present. Returns undefined unless a
 * non-empty string is found (inline thinking tags are handled by the markdown renderer).
 */
export function extractThinking(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) return undefined
  const record = message as Record<string, unknown>
  for (const key of ["reasoning", "reasoning_content", "thinking"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Merge `usage` blocks (e.g. the two legs of a tool round-trip) by summing the
 * numeric fields present in both. Returns undefined when nothing is reported.
 */
export function mergeUsage(
  a: ApiUsage | undefined,
  b: ApiUsage | undefined,
): ApiUsage | undefined {
  const sources: ApiUsage[] = []
  if (a) sources.push(a)
  if (b) sources.push(b)
  if (sources.length === 0) return undefined

  const sum = (key: keyof ApiUsage): number | undefined => {
    let total = 0
    let seen = false
    for (const source of sources) {
      const value = source?.[key]
      if (isFiniteNumber(value)) {
        total += value
        seen = true
      }
    }
    return seen ? total : undefined
  }

  const merged: ApiUsage = {
    prompt_tokens: sum("prompt_tokens"),
    completion_tokens: sum("completion_tokens"),
    total_tokens: sum("total_tokens"),
  }
  if (merged.total_tokens === undefined && merged.prompt_tokens !== undefined && merged.completion_tokens !== undefined) {
    merged.total_tokens = merged.prompt_tokens + merged.completion_tokens
  }
  return merged
}

/**
 * Build the per-turn statistics stored on an assistant message (TODO.MD #3.4).
 * `startedAt` is `Date.now()` taken before the request; token fields stay undefined
 * when the endpoint did not report them.
 */
export function buildStats(
  usage: ApiUsage | undefined,
  startedAt: number,
  contextMessageCount: number,
  aborted = false,
): TurnStats {
  const promptTokens = isFiniteNumber(usage?.prompt_tokens) ? usage.prompt_tokens : undefined
  const completionTokens = isFiniteNumber(usage?.completion_tokens) ? usage.completion_tokens : undefined
  const totalTokens = isFiniteNumber(usage?.total_tokens)
    ? usage.total_tokens
    : promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined
  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const tokensPerSecond =
    completionTokens !== undefined && completionTokens > 0 && elapsedMs > 0
      ? completionTokens / (elapsedMs / 1000)
      : undefined
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    contextMessages: contextMessageCount,
    elapsedMs,
    tokensPerSecond,
    aborted,
  }
}

/** Normalize any provider message object into an AssistantTurn (pure, testable). */
export function toAssistantTurn(
  message: unknown,
  usage: ApiUsage | undefined,
  startedAt: number,
  contextMessageCount: number,
): AssistantTurn {
  if (typeof message !== "object" || message === null) {
    return { content: "", stats: buildStats(usage, startedAt, contextMessageCount) }
  }
  const content = (message as Record<string, unknown>).content
  return {
    content: typeof content === "string" ? content : "",
    thinking: extractThinking(message),
    stats: buildStats(usage, startedAt, contextMessageCount),
  }
}

/** True for a user-initiated abort (fetch AbortController), not a real API failure (TODO.MD #3.3). */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

/** One labelled row for the stats tooltip (TODO.MD #3.4). */
export interface StatLine {
  label: string
  value: string
}

/** Human-readable tooltip rows for a turn's stats; fields the endpoint omitted are skipped. */
export function statsLines(stats: TurnStats): StatLine[] {
  const lines: StatLine[] = [
    {
      label: "Context",
      value: `${stats.contextMessages} message${stats.contextMessages === 1 ? "" : "s"}`,
    },
  ]
  if (stats.promptTokens !== undefined) {
    lines.push({ label: "Tokens in", value: String(stats.promptTokens) })
  }
  if (stats.completionTokens !== undefined) {
    lines.push({ label: "Tokens out", value: String(stats.completionTokens) })
  }
  if (stats.totalTokens !== undefined) {
    lines.push({ label: "Total tokens", value: String(stats.totalTokens) })
  }
  if (stats.tokensPerSecond !== undefined) {
    lines.push({ label: "Speed", value: `${stats.tokensPerSecond.toFixed(1)} tok/s` })
  }
  lines.push({ label: "Duration", value: `${(stats.elapsedMs / 1000).toFixed(1)}s` })
  if (stats.aborted) {
    lines.push({ label: "Status", value: "stopped by user" })
  }
  return lines
}
