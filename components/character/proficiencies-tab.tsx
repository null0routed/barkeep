"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PlusIcon, Trash2Icon } from "lucide-react"
import type { CharacterData } from "@/lib/types"

interface ProficienciesTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  setIsAddProficiencyOpen: (open: boolean) => void
}

export default function ProficienciesTab({ character, setCharacter, setIsAddProficiencyOpen }: ProficienciesTabProps) {
  const removeProficiency = (id: string) => {
    setCharacter((prev) => ({
      ...prev,
      proficiencies: prev.proficiencies.filter((p) => p.id !== id),
    }))
  }

  return (
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
                  <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => removeProficiency(proficiency.id)}>
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
