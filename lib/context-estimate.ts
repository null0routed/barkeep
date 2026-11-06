/**
 * Context-size transparency for chat settings (T5.2).
 *
 * Players routinely hit "context length exceeded" with no idea why (T1.3's error text
 * now says *that*, this says *how big* the request is). These helpers produce a live,
 * honest "≈ N tokens sent with the latest M messages" figure for the settings dialog.
 *
 * The heuristic is intentionally public and dumb, because it has to be explainable in
 * one line: roughly 4 characters ≈ 1 token for English (the rule of thumb OpenAI's
 * own docs have used), plus ~4 tokens of overhead per message (the standard
 * ChatGPT-style per-message accounting for role markers and separators). It is NOT
 * billing-accurate — the point on screen is order-of-magnitude, so no tokenizer
 * dependency ships for a rough estimate.
 */

/** Characters per token in the rough estimate (OpenAI rule of thumb, English-ish text). */
export const CHARS_PER_TOKEN = 4
/** Per-message overhead: role markers + separators, as commonly estimated. */
export const TOKENS_PER_MESSAGE_OVERHEAD = 4

/** Rough token count for one chunk of text (ceil; an empty string is 0). */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** The estimate split by where the tokens came from — the settings line shows both. */
export interface ContextTokenEstimate {
  /** The (resolved) system message: DM prompt + notes/checkpoint blocks + tool instructions. */
  systemTokens: number
  /** The N most recent chat messages as they will be sent. */
  messageTokens: number
  total: number
}

/**
 * Estimate the total context size of one turn: the resolved system message plus the
 * most-recent-messages window (callers pass the already-sliced array, e.g.
 * `messages.slice(-maxMessages)`).
 */
export function estimateContextTokens(
  systemPrompt: string,
  messages: ReadonlyArray<{ content: string }>,
): ContextTokenEstimate {
  const systemTokens = estimateTokens(systemPrompt)
  const messageTokens = messages.reduce(
    (sum, m) => sum + TOKENS_PER_MESSAGE_OVERHEAD + estimateTokens(m.content),
    0,
  )
  return { systemTokens, messageTokens, total: systemTokens + messageTokens }
}

/** Compact token display for the settings line: 850 → "850", 4230 → "4.2K", 1234000 → "1.2M". */
export function formatTokenCount(tokens: number): string {
  const compact = (divisor: number, unit: string): string => {
    const value = (tokens / divisor).toFixed(1).replace(/\.0$/, "")
    return `${value}${unit}`
  }
  if (tokens >= 1_000_000) return compact(1_000_000, "M")
  if (tokens >= 1_000) return compact(1_000, "K")
  return String(tokens)
}
