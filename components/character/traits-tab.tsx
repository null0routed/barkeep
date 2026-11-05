"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, Trait } from "@/lib/types"

interface TraitsTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  editingTraitIndex: number | null
  setEditingTraitIndex: (index: number | null) => void
  tempTrait: Trait
  setTempTrait: (trait: Trait) => void
  setIsAddTraitOpen: (open: boolean) => void
}

export default function TraitsTab({ character, setCharacter, editingTraitIndex, setEditingTraitIndex, tempTrait, setTempTrait, setIsAddTraitOpen }: TraitsTabProps) {
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
  const startEditingTrait = (index: number) => {
    setEditingTraitIndex(index)
    setTempTrait(character.traits[index])
  }
  const cancelEditingTrait = () => {
    setEditingTraitIndex(null)
  }
  const saveTraitEdit = () => {
    if (editingTraitIndex !== null) {
      updateTrait(editingTraitIndex, tempTrait)
      setEditingTraitIndex(null)
    }
  }

  return (
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
                        <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => removeTrait(trait.id)}>
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
  )
}
