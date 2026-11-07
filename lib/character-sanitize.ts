import type { CharacterData } from "./types"
import { defaultCharacter } from "./default-character"

/**
 * Backfill character fields added after a save was written, so pre-feature saves and
 * hand-edited export files load without `undefined`s (TODO.MD #14 added combatStats.speed
 * and the spellcasting block, for example).
 *
 * Top-level keys fall back to the built-in defaults; the two nested stat blocks that
 * gained keys (combatStats, spellcasting) get per-key merges, so a value the player
 * already set is always preserved and only genuinely missing keys are filled in.
 */
export function sanitizeStoredCharacter(parsed: unknown): CharacterData {
  const base = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Partial<CharacterData>
  return {
    ...defaultCharacter,
    ...base,
    combatStats: { ...defaultCharacter.combatStats, ...base.combatStats },
    spellcasting: { ...defaultCharacter.spellcasting, ...base.spellcasting },
  }
}
