"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { CharacterData } from "@/lib/types"
import { formatModifier, getAbilityModifier, getProficiencyBonus } from "./helpers"

interface SavingThrowsSectionProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function SavingThrowsSection({ character, setCharacter }: SavingThrowsSectionProps) {
  const [savingThrowsOpen, setSavingThrowsOpen] = useState(false)
  const proficiencyBonus = getProficiencyBonus(character.level)
  const handleSavingThrowChange = (ability: keyof typeof character.savingThrows, value: boolean) => {
    setCharacter((prev) => ({
      ...prev,
      savingThrows: {
        ...prev.savingThrows,
        [ability]: value,
      },
    }))
  }

  return (
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
  )
}
