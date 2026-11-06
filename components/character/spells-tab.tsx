"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { EditIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { CharacterData, Spell } from "@/lib/types"
import { formatSpellLevel, getSpellSchoolColor } from "./helpers"

interface SpellsTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  setEditingSpell: (spell: Spell | null) => void
  setIsAddSpellOpen: (open: boolean) => void
  startEditingSpell: (spell: Spell) => void
}

export default function SpellsTab({ character, setCharacter, setEditingSpell, setIsAddSpellOpen, startEditingSpell }: SpellsTabProps) {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Spells</CardTitle>
        <Button
          onClick={() => {
            setEditingSpell(null)
            setIsAddSpellOpen(true)
          }}
          aria-label="Add spell"
        >
          <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Spell</span>
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
                          <div className="flex flex-col gap-1 sm:flex-row">
                            <Button size="icon" variant="ghost" aria-label="Edit spell" onClick={() => startEditingSpell(spell)}>
                              <EditIcon className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" aria-label="Remove spell" onClick={() => removeSpell(spell.id)}>
                              <Trash2Icon className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                            <div>
                              <span className="font-medium">Casting Time:</span> {spell.castingTime || "1 action"}
                            </div>
                            <div>
                              <span className="font-medium">Range:</span> {spell.range || "Self"}
                            </div>
                            <div>
                              <span className="font-medium">Duration:</span> {spell.duration || "Instantaneous"}
                            </div>
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
  )
}
