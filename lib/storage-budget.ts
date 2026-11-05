import { NOTES_STORAGE_KEY, NOTES_CONTEXT_KEY } from "./campaign-notes"
import { CHECKPOINTS_STORAGE_KEY } from "./campaign-checkpoints"
import { LOOT_STORAGE_KEY } from "./loot"

/**
 * Browser storage budget (TODO #1 — locked spec).
 *
 * The nominal localStorage quota (≈5 MB per origin) is shared by ALL persisted app
 * state (character, chat, notes, checkpoints, settings). Rather than letting a write
 * fail at the browser's limit, the app enforces its own budget with headroom:
 *
 *   TRIGGER = 4,000,000 bytes — a persist projected past this trims first, then writes
 *   SAFE    = 3,200,000 bytes — trim-TO target (80% of trigger, hysteresis keeps the
 *                               trim from thrashing) AND the line at which the
 *                               persistent "storage nearly full" banner appears
 *
 * Writes never approach 4.75 MB / quota: if trimming can't bring the total under the
 * budget, the persist fails loudly (toast + export guidance) instead of silently
 * losing state. Trim order, per the locked spec: oldest chat first, oldest
 * checkpoints second, notes and the character sheet are never auto-dropped (they are
 * bounded by construction: 16,000-char notes cap, 50-checkpoint store cap,
 * 25-entry loot store).
 *
 * "Bytes" follow the browser's quota accounting: UTF-16 code units × 2
 * (for typical text, 1 character = 2 bytes).
 */

export const STORAGE_HARD_LIMIT_BYTES = 5_000_000
export const STORAGE_TRIGGER_BYTES = 4_000_000
export const STORAGE_SAFE_WATERMARK_BYTES = 3_200_000

/**
 * Serialized size in quota bytes (UTF-16 code units × 2) — the same unit the browser
 * counts against the localStorage quota for typical text content.
 */
export function serializedBytes(value: string): number {
  return value.length * 2
}

/** Human-readable byte amount for UI display ("512 B", "812 KB", "3.4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface PlanChatTrimArgs {
  /** Quota bytes consumed by everything EXCEPT the chat (after any checkpoint cap). */
  baseBytes: number
  /** Quota bytes per chat message, oldest first. */
  messageBytes: number[]
  /** Defaults to the module trigger/safe constants. */
  trigger?: number
  target?: number
}

/**
 * How many oldest chat messages to drop so the total fits under the target.
 * Returns 0 when the current total is within the trigger (nothing to trim).
 * If even dropping every message can't fit (base alone exceeds the target —
 * effectively unreachable since notes/character are capped), returns the full count
 * so the caller fails the write loudly with guidance.
 */
export function planChatTrim({
  baseBytes,
  messageBytes,
  trigger = STORAGE_TRIGGER_BYTES,
  target = STORAGE_SAFE_WATERMARK_BYTES,
}: PlanChatTrimArgs): number {
  const totalChat = messageBytes.reduce((sum, size) => sum + size, 0)
  if (baseBytes + totalChat <= trigger) return 0

  const budget = Math.max(0, target - baseBytes)
  let dropped = 0
  for (let i = 0; i < messageBytes.length; i++) {
    dropped += messageBytes[i]
    if (totalChat - dropped <= budget) return i + 1
  }
  return messageBytes.length
}

/**
 * Current on-disk usage of the listed keys in quota bytes. Missing keys count as 0;
 * a read that throws (storage disabled) counts as 0 rather than crashing the caller.
 * Pass `read` to point at a non-window store (tests).
 */
export function measureStoredBytes(
  keys: string[],
  read: (key: string) => string | null = (key) => (typeof window !== "undefined" ? window.localStorage.getItem(key) : null),
): number {
  let total = 0
  for (const key of keys) {
    let value: string | null = null
    try {
      value = read(key)
    } catch {
      value = null
    }
    if (value) total += serializedBytes(value)
  }
  return total
}

/** Every key the app persists — the single source of truth for usage measurement. */
export const APP_STORAGE_KEYS = [
  "dnd-character",
  "dnd-chat",
  "dnd-api-url",
  "dnd-api-key",
  "dnd-model",
  // Image generation optional settings (TODO #9) — empty when the feature is off,
  // which still counts toward ~zero bytes in measureStoredBytes.
  "dnd-image-api-url",
  "dnd-image-api-key",
  "dnd-image-model",
  "dnd-image-rate",
  "dnd-image-size",
  "dnd-system-prompt",
  "dnd-max-messages",
  NOTES_STORAGE_KEY,
  NOTES_CONTEXT_KEY,
  CHECKPOINTS_STORAGE_KEY,
  LOOT_STORAGE_KEY,
]
