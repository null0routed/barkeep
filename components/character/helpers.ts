// Shared pure helpers for the character section/tab components.
// Moved verbatim from components/character-sheet.tsx (FIXES.MD §3.8).
import type { ItemRarity, SpellSchool } from "@/lib/types"

// Helper function to get rarity color
export const getRarityColor = (rarity: ItemRarity) => {
  switch (rarity) {
    case "common":
      return "bg-gray-200 text-gray-800"
    case "uncommon":
      return "bg-green-200 text-green-800"
    case "rare":
      return "bg-blue-200 text-blue-800"
    case "very rare":
      return "bg-purple-200 text-purple-800"
    case "legendary":
      return "bg-orange-200 text-orange-800"
    case "artifact":
      return "bg-red-200 text-red-800"
    default:
      return "bg-gray-200 text-gray-800"
  }
}
// Helper function to calculate ability modifier
export const getAbilityModifier = (score: number) => {
  return Math.floor((score - 10) / 2)
}
// Helper function to format modifier as string with sign
export const formatModifier = (modifier: number) => {
  return modifier >= 0 ? `+${modifier}` : `${modifier}`
}
// Helper function to get spell school color
export const getSpellSchoolColor = (school: SpellSchool) => {
  switch (school) {
    case "abjuration":
      return "bg-blue-200 text-blue-800"
    case "conjuration":
      return "bg-amber-200 text-amber-800"
    case "divination":
      return "bg-indigo-200 text-indigo-800"
    case "enchantment":
      return "bg-pink-200 text-pink-800"
    case "evocation":
      return "bg-red-200 text-red-800"
    case "illusion":
      return "bg-purple-200 text-purple-800"
    case "necromancy":
      return "bg-gray-200 text-gray-800"
    case "transmutation":
      return "bg-green-200 text-green-800"
    default:
      return "bg-gray-200 text-gray-800"
  }
}
// Helper function to format spell level
export const formatSpellLevel = (level: number) => {
  if (level === 0) return "Cantrip"
  if (level === 1) return "1st Level"
  if (level === 2) return "2nd Level"
  if (level === 3) return "3rd Level"
  return `${level}th Level`
}

// Proficiency bonus from character level (was inlined in character-sheet.tsx)
export const getProficiencyBonus = (level: string) => Math.ceil(1 + Number.parseInt(level || "1") / 4)
