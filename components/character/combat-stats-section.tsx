"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { CharacterData } from "@/lib/types"
import { getProficiencyBonus } from "./helpers"

interface CombatStatsSectionProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function CombatStatsSection({ character, setCharacter }: CombatStatsSectionProps) {
  const [combatStatsOpen, setCombatStatsOpen] = useState(false)
  const proficiencyBonus = getProficiencyBonus(character.level)
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

  return (
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <Label htmlFor="speed">Speed (ft)</Label>
              <Input
                id="speed"
                name="speed"
                type="number"
                value={character.combatStats.speed}
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
  )
}
