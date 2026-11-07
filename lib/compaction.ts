/**
 * Context compaction — an OpenCode-style rolling summary for long conversations.
 *
 * Instead of a fixed "last N messages" window, context is a hard TOKEN budget:
 *
 *     system (DM prompt + checkpoints + tools) + rolling summary + raw tail  ≤  ceiling
 *
 * The conversation grows until history no longer fits, at which point the OLDEST
 * raw messages are summarized into the rolling summary (the "keep recent" tail is
 * always sent verbatim so combat stays legible). The summary then carries that
 * history forward; the raw tail keeps shrinking and growing between compactions.
 * Nothing is ever lost — what falls out of the raw window lands in the summary
 * (and an automatic checkpoint), instead of vanishing like slice(-N) leftovers.
 *
 * Everything here is pure (estimate math, planning, prompt building) so it is
 * testable without a browser; the network call itself lives in chat-interface.
 */

import { estimateTokens, TOKENS_PER_MESSAGE_OVERHEAD } from "./context-estimate"

export interface CompactionSettings {
  /** Master switch for the whole feature (off = legacy "last N messages" window). */
  enabled: boolean
  /** Hard cap on one turn's context (system + summary + raw tail). */
  ceilingTokens: number
  /** Compaction lands the context around here (soft goal, never below the floor). */
  compactTargetTokens: number
  /** Raw messages ALWAYS kept verbatim at the tail (combat-legibility floor). */
  keepMessages: number
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  enabled: true,
  ceilingTokens: 32_000,
  compactTargetTokens: 12_000,
  keepMessages: 20,
}

/** Persistence keys (written by the page's persistState, like the other dnd-* settings). */
export const COMPACTION_SETTINGS_KEY = "dnd-compaction-settings"
/** The rolling summary itself */
export const CONVERSATION_SUMMARY_KEY = "dnd-conversation-summary"
/** How many of the oldest chat messages the summary already covers (the compacted prefix) */
export const SUMMARY_COVERS_KEY = "dnd-summary-covers"
/** Estimate→actual token ratio, learned from the provider's own usage reports */
export const CALIBRATION_KEY = "dnd-context-calibration"

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Validates a settings object out of untrusted sources (localStorage / imported files).
 * Missing or malformed fields fall back to defaults; the target is capped at the
 * ceiling (compacting ABOVE the cap would be a no-op).
 */
export function sanitizeCompactionSettings(raw: unknown): CompactionSettings {
  const record = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const ceilingTokens = clampInt(record.ceilingTokens, DEFAULT_COMPACTION_SETTINGS.ceilingTokens, 8_000, 128_000)
  const rawTarget = clampInt(record.compactTargetTokens, DEFAULT_COMPACTION_SETTINGS.compactTargetTokens, 4_000, 128_000)
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_COMPACTION_SETTINGS.enabled,
    ceilingTokens,
    compactTargetTokens: Math.min(rawTarget, ceilingTokens),
    keepMessages: clampInt(record.keepMessages, DEFAULT_COMPACTION_SETTINGS.keepMessages, 2, 100),
  }
}

// ---------------------------------------------------------------------------
// Estimate calibration (owner request #4): learn the actual/estimated ratio from
// the provider's own prompt_tokens reports, then scale every estimate with it.
// The ratio absorbs what a chars/4 heuristic can't see (tool schemas, exact
// per-message overhead, non-English text). EMA so one outlier turn can't spike it.
// ---------------------------------------------------------------------------

export const CALIBRATION_ALPHA = 0.3
export const CALIBRATION_MIN = 0.5
export const CALIBRATION_MAX = 3.0

/** Scale a token estimate by the learned calibration (clamped for sanity). */
export function applyCalibration(tokens: number, calibration: number): number {
  if (!Number.isFinite(tokens) || tokens < 0) return 0
  const ratio =
    Number.isFinite(calibration) && calibration > 0
      ? Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, calibration))
      : 1
  return Math.round(tokens * ratio)
}

/**
 * Fold one (estimated, actual) observation into the running calibration.
 * Returns the previous value (or 1) when either side is missing/invalid.
 */
export function nextCalibration(previous: number | null, estimated: number, actual: number): number {
  const usable = Number.isFinite(estimated) && estimated > 0 && Number.isFinite(actual) && actual > 0
  if (!usable) return previous == null ? 1 : previous
  const ratio = Math.min(CALIBRATION_MAX, Math.max(CALIBRATION_MIN, actual / estimated))
  if (previous == null || !Number.isFinite(previous)) return ratio
  return Math.round((CALIBRATION_ALPHA * ratio + (1 - CALIBRATION_ALPHA) * previous) * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Window + compaction planning
// ---------------------------------------------------------------------------

/** Token estimate for one chat message (overhead + content), as the estimator sees it. */
export function estimateMessageTokens(content: string): number {
  return TOKENS_PER_MESSAGE_OVERHEAD + estimateTokens(content)
}

/**
 * The lowest index such that `messageTokens.slice(index)` fits the budget once the
 * summary's tokens are accounted for. Always includes at least the MOST RECENT
 * message, even if it alone exceeds the budget (never send an empty turn).
 * `minStart` floors the window (e.g. at the first not-yet-compacted index).
 */
export function fitsWindowStart(
  messageTokens: readonly number[],
  summaryTokens: number,
  budgetTokens: number,
  minStart = 0,
): number {
  const n = messageTokens.length
  if (n === 0) return 0
  let start = n - 1
  let used = Math.max(0, messageTokens[n - 1] ?? 0)
  while (start > minStart) {
    const prev = Math.max(0, messageTokens[start - 1] ?? 0)
    if (summaryTokens + used + prev > budgetTokens) break
    used += prev
    start -= 1
  }
  return start
}

export interface CompactSpan {
  from: number
  to: number
}

export interface CompactionPlan {
  /** The raw tail to send: `messages.slice(sendsFrom)` */
  sendsFrom: number
  /** Passes to run oldest-first; pass i summarizes `messages[from..to)` into the summary */
  passes: CompactSpan[]
  /** Projected one-turn context after the passes: system + summary + raw tail */
  projectedTotal: number
  /** Raw messages older than the kept tail (what compaction can fold) */
  compactableCount: number
}

/** Don't shrink fewer than this (a "compaction" of 2 messages is a shrug). */
export const MIN_COMPACTABLE_MESSAGES = 4
/** Manual "Compact now" is looser — a short session still has something to say. */
export const FORCE_MIN_COMPACTABLE_MESSAGES = 2
/** At most this many summary passes per compaction event (backlog chews in over turns). */
export const MAX_COMPACT_PASSES = 6
/** Room the summary call keeps for its own instruction + the model's output. */
export const SUMMARY_CALL_RESERVE_TOKENS = 4_000
/** Below this, a pass would compact less text than it costs to ask about. */
export const MIN_CHUNK_TOKENS = 800
/** Estimate for how much the merged summary grows per token of transcript folded. */
export const SUMMARY_GROWTH_ESTIMATE = 0.5

interface PlanParams {
  /**
   * Per-message token estimates, OLDEST FIRST — the NOT-YET-COMPACTED region only
   * (the caller slices off the messages the rolling summary already covers; spans in
   * the plan are relative to this list).
   */
  messageTokens: readonly number[]
  /** Rolling summary tokens (0 = none yet) */
  summaryTokens: number
  /** Resolved system message tokens (without the summary block) */
  systemTokens: number
  ceilingTokens: number
  compactTargetTokens: number
  keepMessages: number
  /** Manual "Compact now" — compact even when the context hasn't hit the ceiling */
  force?: boolean
}

function sumTokens(tokens: readonly number[]): number {
  return tokens.reduce((acc, t) => acc + (Number.isFinite(t) && t > 0 ? t : 0), 0)
}

/**
 * Decide what to send and what to fold into the summary for the next turn.
 *
 * - No overflow and not forced → just send the largest budget-fit suffix (the token
 *   version of today's slice(-maxMessages)).
 * - Overflow (or forced) with enough compactable history → fold the OLDEST chunks
 *   into the summary in up to MAX_COMPACT_PASSES passes (each pass's input must fit
 *   the provider window: existing summary + chunk + reserve), then send whatever raw
 *   tail still fits — at most… well, at MOST the kept tail, floored by the budget.
 */
export function planCompaction(params: PlanParams): CompactionPlan {
  const { messageTokens, systemTokens, ceilingTokens, compactTargetTokens, keepMessages, force = false } = params
  const n = messageTokens.length
  const budget = Math.max(0, ceilingTokens - systemTokens)
  const total = (from: number): number => sumTokens(messageTokens.slice(from))

  const plan: CompactionPlan = {
    sendsFrom: 0,
    passes: [],
    projectedTotal: systemTokens + Math.max(0, params.summaryTokens) + (n === 0 ? 0 : total(0)),
    compactableCount: 0,
  }
  if (n === 0) return plan

  const summaryTokens = Math.max(0, params.summaryTokens)
  const keep = Math.min(Math.max(1, keepMessages), n)
  const keepTailTokens = total(n - keep)
  const compactableCount = n - keep
  plan.compactableCount = compactableCount

  const overflow = summaryTokens + total(0) > budget
  const minCompactable = force ? FORCE_MIN_COMPACTABLE_MESSAGES : MIN_COMPACTABLE_MESSAGES
  if ((!overflow && !force) || compactableCount < minCompactable) {
    plan.sendsFrom = fitsWindowStart(messageTokens, summaryTokens, budget)
    plan.projectedTotal = systemTokens + summaryTokens + total(plan.sendsFrom)
    return plan
  }

  // Post-compaction goal: land the total at the target, but NEVER below the
  // unavoidable floor (the summary can only carry its predecessor forward, and the
  // kept tail is mandatory). Target is a goal; the ceiling-derived budget is the law.
  const postCap = Math.min(budget, Math.max(compactTargetTokens, summaryTokens + keepTailTokens))

  let summary = summaryTokens
  let i = 0
  let passes = 0
  // The raw window must never start past this: index n-keep is the first element of
  // the mandatory kept tail. Floor > target > everything else.
  const floorEnd = Math.max(0, n - keep)
  while (i < compactableCount && passes < MAX_COMPACT_PASSES) {
    const tailStart = fitsWindowStart(messageTokens, summary, budget, i)
    if (tailStart >= floorEnd) break // the window already contains only the kept tail
    // Automatic mode stops at the target; "Compact now" keeps folding while older
    // messages remain (a manual compact should visibly do *something*).
    if (!force && summary + total(tailStart) <= postCap) break
    const roomForChunk = ceilingTokens - SUMMARY_CALL_RESERVE_TOKENS - summary
    if (roomForChunk < MIN_CHUNK_TOKENS) break
    // The largest chunk the summary call can hold (existing summary + chunk + reserve
    // must fit the provider window)…
    let maxTo = i
    let maxChunk = 0
    while (maxTo < compactableCount) {
      const next = Math.max(0, messageTokens[maxTo] ?? 0)
      if (maxChunk + next > roomForChunk) break
      maxChunk += next
      maxTo += 1
    }
    if (maxTo === i) break // even the single oldest message won't fit the call
    // …shrunk until the kept tail survives the pass, if needed.
    let to = maxTo
    while (to > i) {
      if (
        fitsWindowStart(messageTokens, summary + sumTokens(messageTokens.slice(i, to)) * SUMMARY_GROWTH_ESTIMATE, budget, to) <=
        floorEnd
      ) {
        break
      }
      to -= 1
    }
    if (to === i) break // no chunk small enough to keep the floor — stop
    plan.passes.push({ from: i, to })
    summary += sumTokens(messageTokens.slice(i, to)) * SUMMARY_GROWTH_ESTIMATE
    i = to
    passes += 1
  }

  // Everything in [0..i) is now in the summary — the raw tail starts there at the
  // earliest, and can only shrink if the summary outgrew the kept-tail goal.
  plan.sendsFrom = fitsWindowStart(messageTokens, summary, budget, i)
  plan.projectedTotal = systemTokens + summary + total(plan.sendsFrom)
  return plan
}

// ---------------------------------------------------------------------------
// The summary call itself (prompt only — the fetch lives in chat-interface)
// ---------------------------------------------------------------------------

/** Hard cap on the summary's word count — keeps it concise so it stays within the
    provider's output limits AND the context budget (a bloated summary is worse than a
    lean one; details already have the checkpoint as their durable anchor). */
export const MAX_SUMMARY_WORDS = 2_000

/** Word budget for the model's summary output. Size tracks the summary's token slot,
    but is floored at 200 words (useful minimum) and capped at MAX_SUMMARY_WORDS
    (output-limit + budget protection). */
export function summaryWordBudget(summarySlotTokens: number): number {
  if (!Number.isFinite(summarySlotTokens) || summarySlotTokens <= 0) return 200
  return Math.min(MAX_SUMMARY_WORDS, Math.max(200, Math.floor(summarySlotTokens * 0.75)))
}

/**
 * Build the summarization request for one pass. The existing summary is carried in
 * so the model MERGES (its output fully replaces it); the transcript is the chunk
 * being folded. The section list mirrors the campaign-checkpoint shape on purpose —
 * a compaction's output doubles as an automatic checkpoint.
 */
export function buildCompactionRequest(
  existingSummary: string | null,
  transcript: string,
  wordBudget: number,
): { system: string; user: string } {
  const system = [
    "You maintain the running continuity summary of a D&D campaign for its Dungeon Master.",
    "You are given (1) the existing running summary, if any, and (2) the next chunk of the session transcript.",
    "Produce ONE updated summary that a fresh DM could pick up mid-scene with. Merge everything: nothing from the existing summary may be dropped, and where they disagree the new transcript is authoritative.",
    "Cover each of these only when it has content: LOCATION & TIME; COMBAT (who is fighting, initiative order, HP and conditions if known, or none); QUESTS (active, paused, completed); CHARACTER (state, injuries, notable inventory changes); NPCS (who, their status and attitude); OPEN THREADS (promises, foreshadowing, unresolved events).",
    `Be concrete: names, numbers, places. Plain prose. Stay within ${wordBudget} words.`,
    "Reply with ONLY the updated summary text — no preamble.",
  ].join("\n")
  const user = `EXISTING SUMMARY:\n${
    existingSummary && existingSummary.trim() ? existingSummary.trim() : "(none — start a fresh summary)"
  }\n\nNEW TRANSCRIPT:\n${transcript}`
  return { system, user }
}

/** Render raw messages as the PLAYER/DM transcript the summarizer reads. */
export function formatTranscriptForCompaction(
  messages: ReadonlyArray<{ role: string; content?: string | null }>,
): string {
  return messages
    .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
    .map((m) => `${m.role === "user" ? "PLAYER" : "DM"}: ${(m.content as string).trim()}`)
    .join("\n\n")
}
