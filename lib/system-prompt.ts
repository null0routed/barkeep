import { DEFAULT_SYSTEM_PROMPT } from "./default-prompts"

/**
 * System prompt separation (TODO #7).
 *
 * - `DEFAULT_SYSTEM_PROMPT` (lib/default-prompts.ts) is the app's built-in Dungeon
 *   Master prompt. It is always what reaches the model when the player has no custom
 *   prompt of their own, but the player should never see it in (or be expected to edit
 *   it from) the chat settings dialog.
 * - The player's custom prompt, when set, fully replaces the built-in one — the app
 *   prefers the player's words (TODO #7).
 * - The `dnd-system-prompt` storage key therefore holds ONLY custom text — or "" —
 *   never a copy of the built-in prompt.
 */

/**
 * Resolves the prompt actually sent to the model: the player's custom prompt when
 * they set one, otherwise the built-in default. The custom text is returned verbatim
 * (no trimming — the player owns their words).
 */
export function resolveSystemPrompt(userPrompt: string, builtIn: string = DEFAULT_SYSTEM_PROMPT): string {
  return userPrompt.trim() ? userPrompt : builtIn
}

/**
 * True when a persisted/imported prompt is a byte-for-byte exact copy of the built-in
 * default — i.e. one the app itself stored before this separation existed. A player who
 * edited the default has a value that differs from it, so theirs is never mistaken for
 * an untouched copy.
 */
export function isUnchangedBuiltInPrompt(persisted: string, builtIn: string = DEFAULT_SYSTEM_PROMPT): boolean {
  return persisted === builtIn
}

/**
 * Migration for pre-separation state (localStorage values and old export files):
 * blank-or-untouched-default becomes "" (meaning "use the built-in"), while any real
 * customization is carried through unchanged.
 */
export function migrateStoredSystemPrompt(
  persisted: string | null | undefined,
  builtIn: string = DEFAULT_SYSTEM_PROMPT,
): string {
  if (!persisted) return ""
  if (isUnchangedBuiltInPrompt(persisted, builtIn)) return ""
  return persisted
}
