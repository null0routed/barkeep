"use client"

import type React from "react"

import { memo, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  CharacterData,
  ChatMessage,
  InventoryItem,
  Equipment,
  Proficiency,
  Trait,
  Feat,
  Spell,
  CampaignNotes,
} from "@/lib/types"
import type { LootEntry } from "@/lib/loot"
import AddItemDialog from "./add-item-dialog"
import AddProficiencyDialog from "./add-proficiency-dialog"
import AddTraitDialog from "./add-trait-dialog"
import AddFeatDialog from "./add-feat-dialog"
import AddSpellDialog from "./add-spell-dialog"
import BasicInfoSection from "./character/basic-info-section"
import CombatStatsSection from "./character/combat-stats-section"
import AbilityScoresSection from "./character/ability-scores-section"
import SavingThrowsSection from "./character/saving-throws-section"
import SpellSlotsSection from "./character/spell-slots-section"
import InventoryTab from "./character/inventory-tab"
import EquipmentTab from "./character/equipment-tab"
import ProficienciesTab from "./character/proficiencies-tab"
import SkillsTab from "./character/skills-tab"
import TraitsTab from "./character/traits-tab"
import FeatsTab from "./character/feats-tab"
import SpellsTab from "./character/spells-tab"
import CampaignNotesCard from "./campaign-notes"

interface CharacterSheetProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  // T3.2: stable read-through accessor (see app/page.tsx) instead of a live array —
  // a per-delta chatMessages array would defeat this component's memo during streaming.
  // Call it when the Generate Details dialogs (item/trait/feat) need the current history.
  getChatMessages: () => ChatMessage[]
  apiUrl?: string
  apiKey?: string
  model?: string
  // "Generate Details" seeding (TODO #8, T8.2): captured loot finds; and the
  // player's custom DM prompt ("" = built-in) — carried by the generator so the
  // dialog's wording stays system-neutral.
  loot: LootEntry[]
  systemPrompt: string
  // Player's campaign notes (rendered between Spell Slots and the Inventory tabs)
  campaignNotes: CampaignNotes
  setCampaignNotes: React.Dispatch<React.SetStateAction<CampaignNotes>>
  notesInContext: boolean
  setNotesInContext: React.Dispatch<React.SetStateAction<boolean>>
}

function CharacterSheet({
  character,
  setCharacter,
  getChatMessages,
  apiUrl = "https://api.openai.com/v1/chat/completions",
  apiKey = "",
  model = "gpt-4o-mini",
  loot,
  systemPrompt,
  campaignNotes,
  setCampaignNotes,
  notesInContext,
  setNotesInContext,
}: CharacterSheetProps) {
  // Inline-edit drafts live here (not in the tabs) because Radix Tabs unmounts
  // inactive tab content — a mid-edit tab switch must not lose the edited values.
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

  // Inventory management
  const addInventoryItem = (item: InventoryItem) => {
    setCharacter((prev) => ({
      ...prev,
      inventory: [...prev.inventory, item],
    }))
  }

  // Equipment management
  const addEquipmentItem = (item: Equipment) => {
    setCharacter((prev) => ({
      ...prev,
      equipment: [...prev.equipment, item],
    }))
  }

  // Proficiency management
  const addProficiency = (proficiency: Proficiency) => {
    setCharacter((prev) => ({
      ...prev,
      proficiencies: [...prev.proficiencies, proficiency],
    }))
  }

  // Trait management
  const addTrait = (trait: Trait) => {
    setCharacter((prev) => ({
      ...prev,
      traits: [...prev.traits, trait],
    }))
  }

  // Feat management
  const addFeat = (feat: Feat) => {
    setCharacter((prev) => ({
      ...prev,
      feats: [...prev.feats, feat],
    }))
  }

  // Spell management (editingSpell doubles as "edit mode" for the spell dialog)
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

  const startEditingSpell = (spell: Spell) => {
    setEditingSpell(spell)
    setIsAddSpellOpen(true)
  }

  return (
    <div className="space-y-4 pb-4">
      <BasicInfoSection character={character} setCharacter={setCharacter} />

      <CombatStatsSection character={character} setCharacter={setCharacter} />

      <AbilityScoresSection character={character} setCharacter={setCharacter} />

      <SavingThrowsSection character={character} setCharacter={setCharacter} />

      <SpellSlotsSection character={character} setCharacter={setCharacter} />

      <CampaignNotesCard
        notes={campaignNotes}
        onUpdate={setCampaignNotes}
        inContext={notesInContext}
        onToggleContext={setNotesInContext}
      />

      <Tabs defaultValue="inventory">
        {/* Mobile (below md): single row that scrolls horizontally — seven 7-word tabs in a
            3-column grid would wrap to 3 rows and overflow the TabsList's fixed h-10,
            visually floating over the tab content. md+: the original 7-column grid. */}
        <TabsList className="w-full flex items-center justify-start gap-1 overflow-x-auto md:grid md:grid-cols-7 md:justify-center">
          <TabsTrigger value="inventory" className="shrink-0">Inventory</TabsTrigger>
          <TabsTrigger value="equipment" className="shrink-0">Equipment</TabsTrigger>
          <TabsTrigger value="proficiencies" className="shrink-0">Proficiencies</TabsTrigger>
          <TabsTrigger value="skills" className="shrink-0">Skills</TabsTrigger>
          <TabsTrigger value="traits" className="shrink-0">Traits</TabsTrigger>
          <TabsTrigger value="feats" className="shrink-0">Feats</TabsTrigger>
          <TabsTrigger value="spells" className="shrink-0">Spells</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory">
          <InventoryTab
            character={character}
            setCharacter={setCharacter}
            editingInventoryIndex={editingInventoryIndex}
            setEditingInventoryIndex={setEditingInventoryIndex}
            tempInventoryItem={tempInventoryItem}
            setTempInventoryItem={setTempInventoryItem}
            setIsAddInventoryOpen={setIsAddInventoryOpen}
          />
        </TabsContent>

        <TabsContent value="equipment">
          <EquipmentTab
            character={character}
            setCharacter={setCharacter}
            editingEquipmentIndex={editingEquipmentIndex}
            setEditingEquipmentIndex={setEditingEquipmentIndex}
            tempEquipmentItem={tempEquipmentItem}
            setTempEquipmentItem={setTempEquipmentItem}
            setIsAddEquipmentOpen={setIsAddEquipmentOpen}
          />
        </TabsContent>

        <TabsContent value="proficiencies">
          <ProficienciesTab
            character={character}
            setCharacter={setCharacter}
            setIsAddProficiencyOpen={setIsAddProficiencyOpen}
          />
        </TabsContent>

        <TabsContent value="skills">
          <SkillsTab character={character} setCharacter={setCharacter} />
        </TabsContent>

        <TabsContent value="traits">
          <TraitsTab
            character={character}
            setCharacter={setCharacter}
            editingTraitIndex={editingTraitIndex}
            setEditingTraitIndex={setEditingTraitIndex}
            tempTrait={tempTrait}
            setTempTrait={setTempTrait}
            setIsAddTraitOpen={setIsAddTraitOpen}
          />
        </TabsContent>

        <TabsContent value="feats">
          <FeatsTab
            character={character}
            setCharacter={setCharacter}
            editingFeatIndex={editingFeatIndex}
            setEditingFeatIndex={setEditingFeatIndex}
            tempFeat={tempFeat}
            setTempFeat={setTempFeat}
            setIsAddFeatOpen={setIsAddFeatOpen}
          />
        </TabsContent>

        <TabsContent value="spells">
          <SpellsTab
            character={character}
            setCharacter={setCharacter}
            setEditingSpell={setEditingSpell}
            setIsAddSpellOpen={setIsAddSpellOpen}
            startEditingSpell={startEditingSpell}
          />
        </TabsContent>
      </Tabs>

      <AddItemDialog
        open={isAddInventoryOpen}
        onOpenChange={setIsAddInventoryOpen}
        onAdd={(item) => addInventoryItem(item as InventoryItem)}
        type="inventory"
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
        loot={loot}
        getChatMessages={getChatMessages}
        systemPrompt={systemPrompt}
      />

      <AddItemDialog
        open={isAddEquipmentOpen}
        onOpenChange={setIsAddEquipmentOpen}
        onAdd={(item) => addEquipmentItem(item as Equipment)}
        type="equipment"
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
        loot={loot}
        getChatMessages={getChatMessages}
        systemPrompt={systemPrompt}
      />

      <AddProficiencyDialog open={isAddProficiencyOpen} onOpenChange={setIsAddProficiencyOpen} onAdd={addProficiency} />

      <AddTraitDialog
        open={isAddTraitOpen}
        onOpenChange={setIsAddTraitOpen}
        onAdd={addTrait}
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
        getChatMessages={getChatMessages}
        systemPrompt={systemPrompt}
      />

      <AddFeatDialog
        open={isAddFeatOpen}
        onOpenChange={setIsAddFeatOpen}
        onAdd={addFeat}
        apiUrl={apiUrl}
        apiKey={apiKey}
        model={model}
        getChatMessages={getChatMessages}
        systemPrompt={systemPrompt}
      />

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

// T3.2: while a turn streams, Home re-renders per delta — previously chatMessages
// (a fresh array each delta) flowed in here and re-rendered the whole sheet,
// including every always-mounted dialog. All props now hold stable identity
// (state, setters, refs, and the getChatMessages accessor), so memo skips the
// entire subtree until something the sheet actually shows changes.
export default memo(CharacterSheet)
