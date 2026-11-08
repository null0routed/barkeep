"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { CharacterData } from "@/lib/types"
import { formatModifier, getAbilityModifier } from "./helpers"

interface AbilityScoresSectionProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function AbilityScoresSection({ character, setCharacter }: AbilityScoresSectionProps) {
  const [abilityScoresOpen, setAbilityScoresOpen] = useState(false)
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

  return (
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
            <div className="hover-glow border rounded-md p-2 space-y-2">
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
  )
}
