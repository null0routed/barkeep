"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { CharacterData } from "@/lib/types"
import { getAbilityModifier, getProficiencyBonus, formatModifier } from "./helpers"

interface SkillsTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function SkillsTab({ character, setCharacter }: SkillsTabProps) {
  const proficiencyBonus = getProficiencyBonus(character.level)
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

  return (
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
              <div key={index} className="hover-glow flex items-center justify-between border-b pb-2">
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
  )
}
