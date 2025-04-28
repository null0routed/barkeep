export interface CharacterData {
  name: string
  class: string
  race: string
  level: string
  background: string
  stats: {
    strength: number
    dexterity: number
    constitution: number
    intelligence: number
    wisdom: number
    charisma: number
  }
  inventory: InventoryItem[]
  equipment: Equipment[]
  proficiencies: Proficiency[]
  skills: Skill[]
  traits: Trait[]
  feats: Feat[]
}

export interface InventoryItem {
  name: string
  description: string
  quantity: number
  rarity: ItemRarity
}

export interface Equipment {
  name: string
  description: string
  equipped: boolean
  rarity: ItemRarity
}

export interface Proficiency {
  id: string
  name: string
  type: "armor" | "weapon" | "tool" | "language" | "other"
}

export interface Skill {
  name: string
  ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"
  proficient: boolean
  expertise: boolean
}

export interface Trait {
  id: string
  name: string
  description: string
  source: string
}

export interface Feat {
  id: string
  name: string
  description: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
}

export type ItemRarity = "common" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact" | "unknown"
