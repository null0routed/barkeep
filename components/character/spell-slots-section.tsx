"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { CharacterData, SpellSlotKey } from "@/lib/types"

interface SpellSlotsSectionProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function SpellSlotsSection({ character, setCharacter }: SpellSlotsSectionProps) {
  const [spellSlotsOpen, setSpellSlotsOpen] = useState(false)
  const handleSpellcastingChange = (field: "spellAttack" | "spellSaveDc", value: number) => {
    setCharacter((prev) => ({
      ...prev,
      spellcasting: {
        ...prev.spellcasting,
        [field]: value,
      },
    }))
  }
  const handleSpellSlotTotalChange = (level: number, total: number) => {
    const levelKey = `level${level}` as SpellSlotKey

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
      const levelKey = `level${level}` as SpellSlotKey
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
    const levelKey = `level${level}` as SpellSlotKey

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

  return (
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
            {/* Spellcasting stats (TODO.MD #14): the attack bonus + save DC pair the
                stat block expects, shown above the slots they govern. */}
            <div className="border rounded-md p-3">
              <div className="flex justify-between items-center gap-4">
                <h3 className="font-medium">Spellcasting</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="spell-attack" className="text-sm">
                      Spell Attack:
                    </Label>
                    <Input
                      id="spell-attack"
                      type="number"
                      value={character.spellcasting.spellAttack}
                      onChange={(e) => handleSpellcastingChange("spellAttack", Number.parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                      min={0}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="spell-save-dc" className="text-sm">
                      Spell Save DC:
                    </Label>
                    <Input
                      id="spell-save-dc"
                      type="number"
                      value={character.spellcasting.spellSaveDc}
                      onChange={(e) => handleSpellcastingChange("spellSaveDc", Number.parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                      min={0}
                    />
                  </div>
                </div>
              </div>
            </div>

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
              const levelKey = `level${level}` as SpellSlotKey
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
  )
}
