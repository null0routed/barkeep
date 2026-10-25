"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, Feat } from "@/lib/types"

interface FeatsTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  editingFeatIndex: number | null
  setEditingFeatIndex: (index: number | null) => void
  tempFeat: Feat
  setTempFeat: (feat: Feat) => void
  setIsAddFeatOpen: (open: boolean) => void
}

export default function FeatsTab({ character, setCharacter, editingFeatIndex, setEditingFeatIndex, tempFeat, setTempFeat, setIsAddFeatOpen }: FeatsTabProps) {
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
  const startEditingFeat = (index: number) => {
    setEditingFeatIndex(index)
    setTempFeat(character.feats[index])
  }
  const cancelEditingFeat = () => {
    setEditingFeatIndex(null)
  }
  const saveFeatEdit = () => {
    if (editingFeatIndex !== null) {
      updateFeat(editingFeatIndex, tempFeat)
      setEditingFeatIndex(null)
    }
  }

  return (
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
  )
}
