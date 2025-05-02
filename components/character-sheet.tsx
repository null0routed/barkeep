"use client"

import type React from "react"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlusIcon, Trash2Icon, EditIcon, CheckIcon, XIcon, ChevronUpIcon, ChevronDownIcon } from "lucide-react"
import type {
  CharacterData,
  ChatMessage,
  InventoryItem,
  Equipment,
  Proficiency,
  Trait,
  Feat,
  ItemRarity,
  Spell,
  SpellSchool,
} from "@/lib/types"
import AddItemDialog from "./add-item-dialog"
import AddProficiencyDialog from "./add-proficiency-dialog"
import AddTraitDialog from "./add-trait-dialog"
import AddFeatDialog from "./add-feat-dialog"
import AddSpellDialog from "./add-spell-dialog"

interface CharacterSheetProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  chatMessages: ChatMessage[]
  apiUrl?: string
  apiKey?: string
  model?: string
}

export default function CharacterSheet({
  character,
  setCharacter,
  chatMessages,
  apiUrl = "https://api.openai.com/v1/chat/completions",
  apiKey = "",
  model = "gpt-4o-mini",
}: CharacterSheetProps) {
  const [editingInventoryIndex, setEditingInventoryIndex] = useState<number | null>(null)
  const [editingEquipmentIndex, setEditingEquipmentIndex] = useState<number | null>(null)
  const [editingTraitIndex, setEditingTraitIndex] = useState<number | null>(null)
  const [editingFeatIndex, setEditingFeatIndex] = useState<number | null>(null)
  const [tempInventoryItem, setTempInventoryItem] = useState<InventoryItem>({
    name: "",
    description: "",
    quantity: 1,
    rarity: "common",
  })
  const [tempEquipmentItem, setTempEquipmentItem] = useState<Equipment>({
    name: "",
    description: "",
    equipped: false,
    rarity: "common",
  })
  const [tempTrait, setTempTrait] = useState<Trait>({ id: "", name: "", description: "", source: "" })
  const [tempFeat, setTempFeat] = useState<Feat>({ id: "", name: "", description: "" })
  const [isAddInventoryOpen, setIsAddInventoryOpen] = useState(false)
  const [isAddEquipmentOpen, setIsAddEquipmentOpen] = useState(false)
  const [isAddProficiencyOpen, setIsAddProficiencyOpen] = useState(false)
  const [isAddTraitOpen, setIsAddTraitOpen] = useState(false)
  const [isAddFeatOpen, setIsAddFeatOpen] = useState(false)
  const [isAddSpellOpen, setIsAddSpellOpen] = useState(false)
  const [editingSpell, setEditingSpell] = useState<Spell | null>(null)
  const [basicInfoOpen, setBasicInfoOpen] = useState(false)
  const [abilityScoresOpen, setAbilityScoresOpen] = useState(false)
  const [combatStatsOpen, setCombatStatsOpen] = useState(false)
  const [savingThrowsOpen, setSavingThrowsOpen] = useState(false)
  const [spellSlotsOpen, setSpellSlotsOpen] = useState(false)

  // Calculate proficiency bonus based on level
  const proficiencyBonus = Math.ceil(1 + Number.parseInt(character.level || "1") / 4)

  const handleBasicInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setCharacter((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleStatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCharacter((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        [name]: Number.parseInt(value) || 0,
      },
    }))
  }

  const handleCombatStatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setCharacter((prev) => ({
      ...prev,
      combatStats: {
        ...prev.combatStats,
        [name]: Number.parseInt(value) || 0,
      },
    }))
  }

  const handleSavingThrowChange = (ability: keyof typeof character.savingThrows, value: boolean) => {
    setCharacter((prev) => ({
      ...prev,
      savingThrows: {
        ...prev.savingThrows,
        [ability]: value,
      },
    }))
  }

  const handleSpellSlotTotalChange = (level: number, total: number) => {
    const levelKey = `level${level}` as keyof typeof character.spellSlots

    setCharacter((prev) => {
      // Create a new array of used slots with the correct length
      const newUsed = Array(total).fill(false)

      // Copy over existing used values if they exist
      if (prev.spellSlots[levelKey].used) {
        prev.spellSlots[levelKey].used.forEach((used, i) => {
          if (i < total) {
            newUsed[i] = used
          }
        })
      }

      return {
        ...prev,
        spellSlots: {
          ...prev.spellSlots,
          [levelKey]: {
            ...prev.spellSlots[levelKey],
            total,
            used: newUsed,
          },
        },
      }
    })
  }

  const handleSpellsKnownChange = (level: number | "cantrips", known: number) => {
    if (level === "cantrips") {
      setCharacter((prev) => ({
        ...prev,
        spellSlots: {
          ...prev.spellSlots,
          cantrips: {
            known,
          },
        },
      }))
    } else {
      const levelKey = `level${level}` as keyof typeof character.spellSlots
      setCharacter((prev) => ({
        ...prev,
        spellSlots: {
          ...prev.spellSlots,
          [levelKey]: {
            ...prev.spellSlots[levelKey],
            known,
          },
        },
      }))
    }
  }

  const handleSpellSlotUseChange = (level: number, index: number, used: boolean) => {
    const levelKey = `level${level}` as keyof typeof character.spellSlots

    setCharacter((prev) => {
      const newUsed = [...prev.spellSlots[levelKey].used]
      newUsed[index] = used

      return {
        ...prev,
        spellSlots: {
          ...prev.spellSlots,
          [levelKey]: {
            ...prev.spellSlots[levelKey],
            used: newUsed,
          },
        },
      }
    })
  }

  const handleSkillChange = (index: number, field: "proficient" | "expertise", value: boolean) => {
    setCharacter((prev) => {
      const newSkills = [...prev.skills]
      newSkills[index] = {
        ...newSkills[index],
        [field]: value,
      }
      return {
        ...prev,
        skills: newSkills,
      }
    })
  }

  // Inventory management
  const addInventoryItem = (item: InventoryItem) => {
    setCharacter((prev) => ({
      ...prev,
      inventory: [...prev.inventory, item],
    }))
  }

  const updateInventoryItem = (index: number, item: InventoryItem) => {
    setCharacter((prev) => {
      const newInventory = [...prev.inventory]
      newInventory[index] = item
      return {
        ...prev,
        inventory: newInventory,
      }
    })
  }

  const removeInventoryItem = (index: number) => {
    setCharacter((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((_, i) => i !== index),
    }))
  }

  // Equipment management
  const addEquipmentItem = (item: Equipment) => {
    setCharacter((prev) => ({
      ...prev,
      equipment: [...prev.equipment, item],
    }))
  }

  const updateEquipmentItem = (index: number, item: Equipment) => {
    setCharacter((prev) => {
      const newEquipment = [...prev.equipment]
      newEquipment[index] = item
      return {
        ...prev,
        equipment: newEquipment,
      }
    })
  }

  const removeEquipmentItem = (index: number) => {
    setCharacter((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((_, i) => i !== index),
    }))
  }

  const toggleEquipped = (index: number) => {
    setCharacter((prev) => {
      const newEquipment = [...prev.equipment]
      newEquipment[index] = {
        ...newEquipment[index],
        equipped: !newEquipment[index].equipped,
      }
      return {
        ...prev,
        equipment: newEquipment,
      }
    })
  }

  // Proficiency management
  const addProficiency = (proficiency: Proficiency) => {
    setCharacter((prev) => ({
      ...prev,
      proficiencies: [...prev.proficiencies, proficiency],
    }))
  }

  const removeProficiency = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      proficiencies: prev.proficiencies.filter((p) => p.id !== id),
    }))
  }

  // Trait management
  const addTrait = (trait: Trait) => {
    setCharacter((prev) => ({
      ...prev,
      traits: [...prev.traits, trait],
    }))
  }

  const updateTrait = (index: number, trait: Trait) => {
    setCharacter((prev) => {
      const newTraits = [...prev.traits]
      newTraits[index] = trait
      return {
        ...prev,
        traits: newTraits,
      }
    })
  }

  const removeTrait = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      traits: prev.traits.filter((t) => t.id !== id),
    }))
  }

  // Feat management
  const addFeat = (feat: Feat) => {
    setCharacter((prev) => ({
      ...prev,
      feats: [...prev.feats, feat],
    }))
  }

  const updateFeat = (index: number, feat: Feat) => {
    setCharacter((prev) => {
      const newFeats = [...prev.feats]
      newFeats[index] = feat
      return {
        ...prev,
        feats: newFeats,
      }
    })
  }

  const removeFeat = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      feats: prev.feats.filter((f) => f.id !== id),
    }))
  }

  // Spell management
  const addSpell = (spell: Spell) => {
    if (editingSpell) {
      // Update existing spell
      setCharacter((prev) => ({
        ...prev,
        spells: prev.spells.map((s) => (s.id === spell.id ? spell : s)),
      }))
      setEditingSpell(null)
    } else {
      // Add new spell
      setCharacter((prev) => ({
        ...prev,
        spells: [...prev.spells, spell],
      }))
    }
  }

  const removeSpell = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      spells: prev.spells.filter((s) => s.id !== id),
    }))
  }

  const togglePrepared = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      spells: prev.spells.map((spell) => (spell.id === id ? { ...spell, prepared: !spell.prepared } : spell)),
    }))
  }

  // Editing functions
  const startEditingInventory = (index: number) => {
    setEditingInventoryIndex(index)
    setTempInventoryItem(character.inventory[index])
  }

  const startEditingEquipment = (index: number) => {
    setEditingEquipmentIndex(index)
    setTempEquipmentItem(character.equipment[index])
  }

  const startEditingTrait = (index: number) => {
    setEditingTraitIndex(index)
    setTempTrait(character.traits[index])
  }

  const startEditingFeat = (index: number) => {
    setEditingFeatIndex(index)
    setTempFeat(character.feats[index])
  }

  const startEditingSpell = (spell: Spell) => {
    setEditingSpell(spell)
    setIsAddSpellOpen(true)
  }

  const cancelEditingInventory = () => {
    setEditingInventoryIndex(null)
  }

  const cancelEditingEquipment = () => {
    setEditingEquipmentIndex(null)
  }

  const cancelEditingTrait = () => {
    setEditingTraitIndex(null)
  }

  const cancelEditingFeat = () => {
    setEditingFeatIndex(null)
  }

  const saveInventoryEdit = () => {
    if (editingInventoryIndex !== null) {
      updateInventoryItem(editingInventoryIndex, tempInventoryItem)
      setEditingInventoryIndex(null)
    }
  }

  const saveEquipmentEdit = () => {
    if (editingEquipmentIndex !== null) {
      updateEquipmentItem(editingEquipmentIndex, tempEquipmentItem)
      setEditingEquipmentIndex(null)
    }
  }

  const saveTraitEdit = () => {
    if (editingTraitIndex !== null) {
      updateTrait(editingTraitIndex, tempTrait)
      setEditingTraitIndex(null)
    }
  }

  const saveFeatEdit = () => {
    if (editingFeatIndex !== null) {
      updateFeat(editingFeatIndex, tempFeat)
      setEditingFeatIndex(null)
    }
  }

  // Helper function to get rarity color
  const getRarityColor = (rarity: ItemRarity) => {
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
  const getAbilityModifier = (score: number) => {
    return Math.floor((score - 10) / 2)
  }

  // Helper function to format modifier as string with sign
  const formatModifier = (modifier: number) => {
    return modifier >= 0 ? `+${modifier}` : `${modifier}`
  }

  // Helper function to get spell school color
  const getSpellSchoolColor = (school: SpellSchool) => {
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
  const formatSpellLevel = (level: number) => {
    if (level === 0) return "Cantrip"
    if (level === 1) return "1st Level"
    if (level === 2) return "2nd Level"
    if (level === 3) return "3rd Level"
    return `${level}th Level`
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
          <CardTitle className="text-base">Basic Information</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBasicInfoOpen(!basicInfoOpen)}
            aria-label={basicInfoOpen ? "Collapse basic information" : "Expand basic information"}
          >
            {basicInfoOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {basicInfoOpen && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Character Name</Label>
                <Input id="name" name="name" value={character.name} onChange={handleBasicInfoChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class">Class</Label>
                <Input id="class" name="class" value={character.class} onChange={handleBasicInfoChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="race">Race</Label>
                <Input id="race" name="race" value={character.race} onChange={handleBasicInfoChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Input id="level" name="level" type="number" value={character.level} onChange={handleBasicInfoChange} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="background">Background</Label>
                <Textarea
                  id="background"
                  name="background"
                  value={character.background}
                  onChange={handleBasicInfoChange}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
          <CardTitle className="text-base">Combat Stats</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCombatStatsOpen(!combatStatsOpen)}
            aria-label={combatStatsOpen ? "Collapse combat stats" : "Expand combat stats"}
          >
            {combatStatsOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {combatStatsOpen && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="armorClass">Armor Class</Label>
                <Input
                  id="armorClass"
                  name="armorClass"
                  type="number"
                  value={character.combatStats.armorClass}
                  onChange={handleCombatStatChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentHp">Current HP</Label>
                <Input
                  id="currentHp"
                  name="currentHp"
                  type="number"
                  value={character.combatStats.currentHp}
                  onChange={handleCombatStatChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxHp">Max HP</Label>
                <Input
                  id="maxHp"
                  name="maxHp"
                  type="number"
                  value={character.combatStats.maxHp}
                  onChange={handleCombatStatChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="proficiencyBonus">Proficiency Bonus</Label>
                <div className="h-10 px-3 py-2 rounded-md border border-input bg-muted flex items-center justify-center font-medium">
                  +{proficiencyBonus}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
          <CardTitle className="text-base">Ability Scores</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAbilityScoresOpen(!abilityScoresOpen)}
            aria-label={abilityScoresOpen ? "Collapse ability scores" : "Expand ability scores"}
          >
            {abilityScoresOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {abilityScoresOpen && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label htmlFor="strength">Strength</Label>
                <Input
                  id="strength"
                  name="strength"
                  type="number"
                  value={character.stats.strength}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.strength))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dexterity">Dexterity</Label>
                <Input
                  id="dexterity"
                  name="dexterity"
                  type="number"
                  value={character.stats.dexterity}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.dexterity))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="constitution">Constitution</Label>
                <Input
                  id="constitution"
                  name="constitution"
                  type="number"
                  value={character.stats.constitution}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.constitution))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="intelligence">Intelligence</Label>
                <Input
                  id="intelligence"
                  name="intelligence"
                  type="number"
                  value={character.stats.intelligence}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.intelligence))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wisdom">Wisdom</Label>
                <Input
                  id="wisdom"
                  name="wisdom"
                  type="number"
                  value={character.stats.wisdom}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.wisdom))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="charisma">Charisma</Label>
                <Input
                  id="charisma"
                  name="charisma"
                  type="number"
                  value={character.stats.charisma}
                  onChange={handleStatChange}
                />
                <div className="text-center text-sm">
                  Modifier: {formatModifier(getAbilityModifier(character.stats.charisma))}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
          <CardTitle className="text-base">Saving Throws</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSavingThrowsOpen(!savingThrowsOpen)}
            aria-label={savingThrowsOpen ? "Collapse saving throws" : "Expand saving throws"}
          >
            {savingThrowsOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {savingThrowsOpen && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(Object.keys(character.savingThrows) as Array<keyof typeof character.savingThrows>).map((ability) => {
                const abilityScore = character.stats[ability]
                const baseModifier = getAbilityModifier(abilityScore)
                const isProficient = character.savingThrows[ability]
                const totalModifier = baseModifier + (isProficient ? proficiencyBonus : 0)

                return (
                  <div key={ability} className="flex flex-col items-center p-2 border rounded-md">
                    <div className="text-lg font-bold">{formatModifier(totalModifier)}</div>
                    <div className="text-sm capitalize mb-2">{ability}</div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`save-${ability}`}
                        checked={isProficient}
                        onCheckedChange={(checked) => handleSavingThrowChange(ability, checked as boolean)}
                      />
                      <Label htmlFor={`save-${ability}`} className="text-xs">
                        Proficient
                      </Label>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
          <CardTitle className="text-base">Spell Slots</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSpellSlotsOpen(!spellSlotsOpen)}
            aria-label={spellSlotsOpen ? "Collapse spell slots" : "Expand spell slots"}
          >
            {spellSlotsOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {spellSlotsOpen && (
          <CardContent>
            <div className="space-y-6">
              {/* Cantrips */}
              <div className="border rounded-md p-3">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Cantrips</h3>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cantrips-known" className="text-sm">
                      Known:
                    </Label>
                    <Input
                      id="cantrips-known"
                      type="number"
                      value={character.spellSlots.cantrips.known}
                      onChange={(e) => handleSpellsKnownChange("cantrips", Number.parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                      min={0}
                    />
                  </div>
                </div>
              </div>

              {/* Spell Levels 1-9 */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                const levelKey = `level${level}` as keyof typeof character.spellSlots
                const { total, used, known } = character.spellSlots[levelKey]

                return (
                  <div key={level} className="border rounded-md p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-medium">Level {level}</h3>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`spells-known-${level}`} className="text-sm">
                            Known:
                          </Label>
                          <Input
                            id={`spells-known-${level}`}
                            type="number"
                            value={known}
                            onChange={(e) => handleSpellsKnownChange(level, Number.parseInt(e.target.value) || 0)}
                            className="w-16 h-8 text-center"
                            min={0}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`spell-slots-${level}`} className="text-sm">
                            Slots:
                          </Label>
                          <Input
                            id={`spell-slots-${level}`}
                            type="number"
                            value={total}
                            onChange={(e) => handleSpellSlotTotalChange(level, Number.parseInt(e.target.value) || 0)}
                            className="w-16 h-8 text-center"
                            min={0}
                            max={9}
                          />
                        </div>
                      </div>
                    </div>

                    {total > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: total }).map((_, index) => (
                          <div key={index} className="flex items-center gap-1">
                            <Checkbox
                              id={`spell-slot-${level}-${index}`}
                              checked={used[index] || false}
                              onCheckedChange={(checked) => handleSpellSlotUseChange(level, index, checked as boolean)}
                            />
                            <Label htmlFor={`spell-slot-${level}-${index}`} className="text-xs">
                              Used
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="inventory">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-7">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="proficiencies">Proficiencies</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="traits">Traits</TabsTrigger>
          <TabsTrigger value="feats">Feats</TabsTrigger>
          <TabsTrigger value="spells">Spells</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Inventory</CardTitle>
              <Button onClick={() => setIsAddInventoryOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {character.inventory.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No items in inventory</div>
                ) : (
                  character.inventory.map((item, index) => (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      {editingInventoryIndex === index ? (
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={tempInventoryItem.name}
                              onChange={(e) => setTempInventoryItem({ ...tempInventoryItem, name: e.target.value })}
                              placeholder="Item name"
                            />
                            <Input
                              type="number"
                              value={tempInventoryItem.quantity}
                              onChange={(e) =>
                                setTempInventoryItem({
                                  ...tempInventoryItem,
                                  quantity: Number.parseInt(e.target.value) || 1,
                                })
                              }
                              className="w-20"
                              min={1}
                            />
                          </div>
                          <Textarea
                            value={tempInventoryItem.description}
                            onChange={(e) =>
                              setTempInventoryItem({ ...tempInventoryItem, description: e.target.value })
                            }
                            placeholder="Description"
                            rows={2}
                          />
                          <Select
                            value={tempInventoryItem.rarity}
                            onValueChange={(value) =>
                              setTempInventoryItem({ ...tempInventoryItem, rarity: value as ItemRarity })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select rarity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="common">Common</SelectItem>
                              <SelectItem value="uncommon">Uncommon</SelectItem>
                              <SelectItem value="rare">Rare</SelectItem>
                              <SelectItem value="very rare">Very Rare</SelectItem>
                              <SelectItem value="legendary">Legendary</SelectItem>
                              <SelectItem value="artifact">Artifact</SelectItem>
                              <SelectItem value="unknown">Unknown</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveInventoryEdit}>
                              <CheckIcon className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditingInventory}>
                              <XIcon className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {item.name} {item.quantity > 1 && `(${item.quantity})`}
                              <Badge className={getRarityColor(item.rarity)}>
                                {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                              </Badge>
                            </div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground">{item.description}</div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => startEditingInventory(index)}>
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => removeInventoryItem(index)}>
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipment">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Equipment</CardTitle>
              <Button onClick={() => setIsAddEquipmentOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" /> Add Equipment
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {character.equipment.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No equipment items</div>
                ) : (
                  character.equipment.map((item, index) => (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      {editingEquipmentIndex === index ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={tempEquipmentItem.name}
                            onChange={(e) => setTempEquipmentItem({ ...tempEquipmentItem, name: e.target.value })}
                            placeholder="Equipment name"
                          />
                          <Textarea
                            value={tempEquipmentItem.description}
                            onChange={(e) =>
                              setTempEquipmentItem({ ...tempEquipmentItem, description: e.target.value })
                            }
                            placeholder="Description"
                            rows={2}
                          />
                          <Select
                            value={tempEquipmentItem.rarity}
                            onValueChange={(value) =>
                              setTempEquipmentItem({ ...tempEquipmentItem, rarity: value as ItemRarity })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select rarity" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="common">Common</SelectItem>
                              <SelectItem value="uncommon">Uncommon</SelectItem>
                              <SelectItem value="rare">Rare</SelectItem>
                              <SelectItem value="very rare">Very Rare</SelectItem>
                              <SelectItem value="legendary">Legendary</SelectItem>
                              <SelectItem value="artifact">Artifact</SelectItem>
                              <SelectItem value="unknown">Unknown</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`equipped-edit-${index}`}
                              checked={tempEquipmentItem.equipped}
                              onChange={(e) =>
                                setTempEquipmentItem({ ...tempEquipmentItem, equipped: e.target.checked })
                              }
                              className="h-4 w-4"
                            />
                            <Label htmlFor={`equipped-edit-${index}`}>Equipped</Label>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEquipmentEdit}>
                              <CheckIcon className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditingEquipment}>
                              <XIcon className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {item.name} {item.equipped && "(Equipped)"}
                              <Badge className={getRarityColor(item.rarity)}>
                                {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                              </Badge>
                            </div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground">{item.description}</div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={item.equipped ? "default" : "outline"}
                              onClick={() => toggleEquipped(index)}
                            >
                              {item.equipped ? "Unequip" : "Equip"}
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => startEditingEquipment(index)}>
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => removeEquipmentItem(index)}>
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proficiencies">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Proficiencies</CardTitle>
              <Button onClick={() => setIsAddProficiencyOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" /> Add Proficiency
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {character.proficiencies.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No proficiencies</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {character.proficiencies.map((proficiency) => (
                      <div key={proficiency.id} className="flex items-center justify-between border p-2 rounded-md">
                        <div>
                          <span className="font-medium">{proficiency.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {proficiency.type.charAt(0).toUpperCase() + proficiency.type.slice(1)}
                          </Badge>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeProficiency(proficiency.id)}>
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="skills">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {character.skills.map((skill, index) => {
                  const abilityMod = getAbilityModifier(character.stats[skill.ability])
                  let totalBonus = abilityMod

                  if (skill.proficient) {
                    totalBonus += proficiencyBonus
                  }

                  if (skill.expertise) {
                    totalBonus += proficiencyBonus
                  }

                  const bonusText = formatModifier(totalBonus)

                  return (
                    <div key={index} className="flex items-center justify-between border-b pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 text-center font-medium">{bonusText}</div>
                        <div className="font-medium">{skill.name}</div>
                        <div className="text-sm text-muted-foreground">
                          ({skill.ability.substring(0, 3).toUpperCase()})
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`prof-${index}`}
                            checked={skill.proficient}
                            onCheckedChange={(checked) => handleSkillChange(index, "proficient", checked as boolean)}
                          />
                          <Label htmlFor={`prof-${index}`} className="text-sm">
                            Prof
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`exp-${index}`}
                            checked={skill.expertise}
                            onCheckedChange={(checked) => handleSkillChange(index, "expertise", checked as boolean)}
                            disabled={!skill.proficient}
                          />
                          <Label htmlFor={`exp-${index}`} className="text-sm">
                            Exp
                          </Label>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traits">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Traits</CardTitle>
              <Button onClick={() => setIsAddTraitOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" /> Add Trait
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {character.traits.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No traits</div>
                ) : (
                  character.traits.map((trait, index) => (
                    <div key={trait.id} className="border rounded-md p-3">
                      {editingTraitIndex === index ? (
                        <div className="space-y-2">
                          <Input
                            value={tempTrait.name}
                            onChange={(e) => setTempTrait({ ...tempTrait, name: e.target.value })}
                            placeholder="Trait name"
                          />
                          <Textarea
                            value={tempTrait.description}
                            onChange={(e) => setTempTrait({ ...tempTrait, description: e.target.value })}
                            placeholder="Description"
                            rows={3}
                          />
                          <Input
                            value={tempTrait.source}
                            onChange={(e) => setTempTrait({ ...tempTrait, source: e.target.value })}
                            placeholder="Source (e.g., Race, Background)"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveTraitEdit}>
                              <CheckIcon className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditingTrait}>
                              <XIcon className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold">{trait.name}</h3>
                              <div className="text-sm text-muted-foreground">Source: {trait.source || "Unknown"}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => startEditingTrait(index)}>
                                <EditIcon className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => removeTrait(trait.id)}>
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2">{trait.description}</div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feats">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Feats</CardTitle>
              <Button onClick={() => setIsAddFeatOpen(true)}>
                <PlusIcon className="h-4 w-4 mr-2" /> Add Feat
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {character.feats.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No feats</div>
                ) : (
                  character.feats.map((feat, index) => (
                    <div key={feat.id} className="border rounded-md p-3">
                      {editingFeatIndex === index ? (
                        <div className="space-y-2">
                          <Input
                            value={tempFeat.name}
                            onChange={(e) => setTempFeat({ ...tempFeat, name: e.target.value })}
                            placeholder="Feat name"
                          />
                          <Textarea
                            value={tempFeat.description}
                            onChange={(e) => setTempFeat({ ...tempFeat, description: e.target.value })}
                            placeholder="Description"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveFeatEdit}>
                              <CheckIcon className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEditingFeat}>
                              <XIcon className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start">
                            <h3 className="font-bold">{feat.name}</h3>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => startEditingFeat(index)}>
                                <EditIcon className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => removeFeat(feat.id)}>
                                <Trash2Icon className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2">{feat.description}</div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spells">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
              <CardTitle className="text-base">Spells</CardTitle>
              <Button
                onClick={() => {
                  setEditingSpell(null)
                  setIsAddSpellOpen(true)
                }}
              >
                <PlusIcon className="h-4 w-4 mr-2" /> Add Spell
              </Button>
            </CardHeader>
            <CardContent>
              {character.spells.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">No spells</div>
              ) : (
                <div className="space-y-6">
                  {/* Group spells by level */}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                    const spellsAtLevel = character.spells.filter((spell) => spell.level === level)
                    if (spellsAtLevel.length === 0) return null

                    return (
                      <div key={level} className="space-y-2">
                        <h3 className="font-medium">{formatSpellLevel(level)}</h3>
                        <div className="space-y-2">
                          {spellsAtLevel.map((spell) => (
                            <div key={spell.id} className="border rounded-md p-3">
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold">{spell.name}</h4>
                                  <Badge className={getSpellSchoolColor(spell.school)}>
                                    {spell.school.charAt(0).toUpperCase() + spell.school.slice(1)}
                                  </Badge>
                                  {level > 0 && (
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`prepared-${spell.id}`}
                                        checked={spell.prepared}
                                        onCheckedChange={() => togglePrepared(spell.id)}
                                      />
                                      <Label htmlFor={`prepared-${spell.id}`} className="text-xs">
                                        Prepared
                                      </Label>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => startEditingSpell(spell)}>
                                    <EditIcon className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => removeSpell(spell.id)}>
                                    <Trash2Icon className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-2 text-sm">
                                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                                  <div>
                                    <span className="font-medium">Range:</span> {spell.range}
                                  </div>
                                  {spell.target && (
                                    <div>
                                      <span className="font-medium">Target:</span> {spell.target}
                                    </div>
                                  )}
                                  <div>
                                    <span className="font-medium">Components:</span>{" "}
                                    {[spell.verbal ? "V" : "", spell.somatic ? "S" : "", spell.material ? "M" : ""]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </div>
                                </div>
                                {spell.material && spell.materialComponents && (
                                  <div className="mb-2">
                                    <span className="font-medium">Materials:</span> {spell.materialComponents}
                                  </div>
                                )}
                                <div>{spell.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddItemDialog
        open={isAddInventoryOpen}
        onOpenChange={setIsAddInventoryOpen}
        onAdd={addInventoryItem}
        type="inventory"
        chatMessages={chatMessages}
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
      />

      <AddItemDialog
        open={isAddEquipmentOpen}
        onOpenChange={setIsAddEquipmentOpen}
        onAdd={addEquipmentItem}
        type="equipment"
        chatMessages={chatMessages}
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
      />

      <AddProficiencyDialog open={isAddProficiencyOpen} onOpenChange={setIsAddProficiencyOpen} onAdd={addProficiency} />

      <AddTraitDialog
        open={isAddTraitOpen}
        onOpenChange={setIsAddTraitOpen}
        onAdd={addTrait}
        chatMessages={chatMessages}
      />

      <AddFeatDialog open={isAddFeatOpen} onOpenChange={setIsAddFeatOpen} onAdd={addFeat} chatMessages={chatMessages} />

      <AddSpellDialog
        open={isAddSpellOpen}
        onOpenChange={(open) => {
          setIsAddSpellOpen(open)
          if (!open) setEditingSpell(null)
        }}
        onAdd={addSpell}
        editingSpell={editingSpell}
      />
    </div>
  )
}
