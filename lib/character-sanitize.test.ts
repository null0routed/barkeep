import test from "node:test"
import assert from "node:assert/strict"

import { sanitizeStoredCharacter } from "./character-sanitize"
import { defaultCharacter } from "./default-character"
import type { CharacterData } from "./types"

test("sanitizeStoredCharacter: a pre-#14 save (no speed, no spellcasting) loads with defaults", () => {
  const legacy = {
    name: "Renna",
    class: "Rogue",
    race: "Human",
    level: "3",
    background: "Criminal",
    stats: { strength: 14, dexterity: 18, constitution: 12, intelligence: 10, wisdom: 12, charisma: 10 },
    combatStats: { armorClass: 14, currentHp: 18, maxHp: 18 },
    savingThrows: { strength: false, dexterity: true, constitution: false, intelligence: false, wisdom: false, charisma: false },
    skills: [],
    inventory: [],
    equipment: [],
    proficiencies: [],
    traits: [],
    feats: [],
    spells: [],
    spellSlots: defaultCharacter.spellSlots,
  }
  const saved = sanitizeStoredCharacter(legacy)
  assert.equal(saved.combatStats.speed, 30) // filled from defaults
  assert.equal(saved.spellcasting.spellAttack, 0)
  assert.equal(saved.spellcasting.spellSaveDc, 0)
  assert.equal(saved.combatStats.armorClass, 14) // player value preserved
  assert.equal(saved.name, "Renna")
})

test("sanitizeStoredCharacter: current-shape values are preserved untouched", () => {
  const current: CharacterData = {
    ...defaultCharacter,
    combatStats: { armorClass: 18, currentHp: 33, maxHp: 38, speed: 45 },
    spellcasting: { spellAttack: 7, spellSaveDc: 15 },
  }
  const saved = sanitizeStoredCharacter(current)
  assert.equal(saved.combatStats.speed, 45)
  assert.equal(saved.combatStats.armorClass, 18)
  assert.equal(saved.spellcasting.spellAttack, 7)
  assert.equal(saved.spellcasting.spellSaveDc, 15)
})

test("sanitizeStoredCharacter: garbage input degrades to defaults, not NaNs/undefineds", () => {
  for (const garbage of [null, undefined, 42, "barkeep", NaN, false]) {
    const saved = sanitizeStoredCharacter(garbage)
    assert.equal(saved.combatStats.speed, 30)
    assert.equal(saved.spellcasting.spellAttack, 0)
    assert.equal(typeof saved.name, "string")
  }
})
