import type { CharacterData, SpellSlotKey } from "./types"

/**
 * Formats character data into a concise, readable format for the AI
 */
export function formatCharacterData(character: CharacterData): string {
  // Calculate ability modifiers
  const getModifier = (score: number) => Math.floor((score - 10) / 2)
  const formatModifier = (mod: number) => (mod >= 0 ? `+${mod}` : `${mod}`)

  // Format ability scores with modifiers
  const abilities = Object.entries(character.stats).map(
    ([ability, score]) =>
      `${ability.charAt(0).toUpperCase() + ability.slice(1)}: ${score} (${formatModifier(getModifier(score))})`,
  )

  // Format skills with proficiency
  const skills = character.skills
    .filter((skill) => skill.proficient || skill.expertise)
    .map((skill) => {
      const abilityMod = getModifier(character.stats[skill.ability])
      const profBonus = Math.ceil(1 + Number.parseInt(character.level || "1") / 4)
      const bonus = abilityMod + (skill.proficient ? profBonus : 0) + (skill.expertise ? profBonus : 0)
      return `${skill.name}: ${formatModifier(bonus)}${skill.expertise ? " (expertise)" : ""}`
    })

  // Format inventory items
  const inventory = character.inventory.map(
    (item) => `${item.name} (${item.quantity})${item.rarity !== "common" ? ` - ${item.rarity}` : ""}`,
  )

  // Format equipment
  const equipment = character.equipment.map(
    (item) => `${item.name}${item.equipped ? " (equipped)" : ""}${item.rarity !== "common" ? ` - ${item.rarity}` : ""}`,
  )

  // Format proficiencies
  const proficiencies = character.proficiencies.map((prof) => `${prof.name} (${prof.type})`)

  // Format traits
  const traits = character.traits.map((trait) => `${trait.name}${trait.source ? ` (${trait.source})` : ""}`)

  // Format feats
  const feats = character.feats.map((feat) => feat.name)

  // Format spells by level
  const spellsByLevel: Record<string, string[]> = {}
  character.spells.forEach((spell) => {
    const level = spell.level === 0 ? "Cantrips" : `Level ${spell.level}`
    if (!spellsByLevel[level]) {
      spellsByLevel[level] = []
    }
    spellsByLevel[level].push(`${spell.name}${spell.prepared ? " (prepared)" : ""}`)
  })

  const spells = Object.entries(spellsByLevel).map(([level, spellList]) => `${level}: ${spellList.join(", ")}`)

  // Format spell slots
  const spellSlots = []
  for (let i = 1; i <= 9; i++) {
    const levelKey = `level${i}` as SpellSlotKey
    const { total, used } = character.spellSlots[levelKey]
    if (total > 0) {
      const usedCount = used.filter(Boolean).length
      spellSlots.push(`Level ${i}: ${total - usedCount}/${total}`)
    }
  }

  // Format spellcasting stats (TODO.MD #14) — only when the character has them set,
  // same "omit when empty" rule as the other optional blocks.
  const hasSpellcasting =
    (character.spellcasting?.spellAttack ?? 0) > 0 || (character.spellcasting?.spellSaveDc ?? 0) > 0
  const spellcasting = hasSpellcasting
    ? `Spell Attack: ${formatModifier(character.spellcasting.spellAttack)} | Spell Save DC: ${character.spellcasting.spellSaveDc}`
    : ""

  // Build the formatted character sheet
  return `
CHARACTER SHEET: ${character.name || "Unnamed Character"}
Class: ${character.class || "Unknown"} | Race: ${character.race || "Unknown"} | Level: ${character.level || "1"}

ABILITY SCORES:
${abilities.join(" | ")}

COMBAT STATS:
HP: ${character.combatStats.currentHp}/${character.combatStats.maxHp} | AC: ${character.combatStats.armorClass} | Speed: ${character.combatStats.speed} ft

${
  skills.length > 0
    ? `SKILLS:
${skills.join(" | ")}

`
    : ""
}${
  spells.length > 0
    ? `SPELLS:
${spells.join("\n")}

`
    : ""
}${
  spellSlots.length > 0
    ? `SPELL SLOTS:
${spellSlots.join(" | ")}

`
    : ""
}${
  spellcasting
    ? `SPELLCASTING:
${spellcasting}

`
    : ""
}${
  inventory.length > 0
    ? `INVENTORY:
${inventory.join(", ")}

`
    : ""
}${
  equipment.length > 0
    ? `EQUIPMENT:
${equipment.join(", ")}

`
    : ""
}${
  proficiencies.length > 0
    ? `PROFICIENCIES:
${proficiencies.join(", ")}

`
    : ""
}${
  traits.length > 0
    ? `TRAITS:
${traits.join(", ")}

`
    : ""
}${
  feats.length > 0
    ? `FEATS:
${feats.join(", ")}

`
    : ""
}${
  character.background
    ? `BACKGROUND:
${character.background}`
    : ""
}
`.trim()
}
