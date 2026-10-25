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
  combatStats: {
    armorClass: number
    currentHp: number
    maxHp: number
  }
  savingThrows: {
    strength: boolean
    dexterity: boolean
    constitution: boolean
    intelligence: boolean
    wisdom: boolean
    charisma: boolean
  }
  skills: Skill[]
  inventory: InventoryItem[]
  equipment: Equipment[]
  proficiencies: Proficiency[]
  traits: Trait[]
  feats: Feat[]
  spells: Spell[]
  spellSlots: {
    cantrips: {
      known: number
    }
    level1: {
      total: number
      used: boolean[]
      known: number
    }
    level2: {
      total: number
      used: boolean[]
      known: number
    }
    level3: {
      total: number
      used: boolean[]
      known: number
    }
    level4: {
      total: number
      used: boolean[]
      known: number
    }
    level5: {
      total: number
      used: boolean[]
      known: number
    }
    level6: {
      total: number
      used: boolean[]
      known: number
    }
    level7: {
      total: number
      used: boolean[]
      known: number
    }
    level8: {
      total: number
      used: boolean[]
      known: number
    }
    level9: {
      total: number
      used: boolean[]
      known: number
    }
  }
}

export interface Skill {
  name: string
  ability: keyof CharacterData["stats"]
  proficient: boolean
  expertise: boolean
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

export type ItemRarity = "common" | "uncommon" | "rare" | "very rare" | "legendary" | "artifact" | "unknown"

export interface Proficiency {
  id: string
  name: string
  type: "armor" | "weapon" | "tool" | "language" | "other"
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

export type SpellSchool =
  | "abjuration"
  | "conjuration"
  | "divination"
  | "enchantment"
  | "evocation"
  | "illusion"
  | "necromancy"
  | "transmutation"

export interface Spell {
  id: string
  name: string
  description: string
  level: number
  school: SpellSchool
  range: string
  duration: string
  castingTime: string
  verbal: boolean
  somatic: boolean
  material: boolean
  materialComponents: string
  prepared: boolean
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
}

export interface CampaignSummary {
  conversationSummary: string
  plotPoints: string
  npcs: string
  locations: string
  quests: string
  lastUpdated?: string
}

export interface CampaignNotes {
  plotPoints: string
  npcs: string
  locations: string
  quests: string
  lastUpdated?: string
}

/**
 * A point-in-time snapshot of the campaign's status, written by the AI through the
 * saveCampaignCheckpoint tool and read back through getCampaignCheckpoints.
 * Only title and summary are required so the shape stays usable for any game system.
 */
export interface CampaignCheckpoint {
  id: string
  /** ISO 8601 timestamp of when the checkpoint was saved */
  createdAt: string
  title: string
  summary: string
  currentLocation?: string
  activeQuests?: string
  plotPoints?: string
  npcs?: string
  notes?: string
}

export { ConversationSummary }
