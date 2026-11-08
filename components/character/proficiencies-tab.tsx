"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PlusIcon } from "lucide-react"
import SpriteIcon from "@/components/sprite-icon"
import type { CharacterData } from "@/lib/types"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex } from "@/lib/reorder"

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

  // TODO.MD #17: reorder. No inline edit exists here, so the controls are always
  // live (the other tabs hide them while a row is being edited in place).
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleProficiencyDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (
        sourceIndex < 0 ||
        sourceIndex >= prev.proficiencies.length ||
        targetIndex < 0 ||
        targetIndex >= prev.proficiencies.length
      )
        return prev
      return { ...prev, proficiencies: moveItem(prev.proficiencies, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Proficiencies</CardTitle>
        <Button onClick={() => setIsAddProficiencyOpen(true)} aria-label="Add proficiency">
          <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Proficiency</span>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.proficiencies.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No proficiencies</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {character.proficiencies.map((proficiency, index) => (
                <div
                  key={proficiency.id}
                  data-reorder-row
                  className={`hover-glow border p-2 rounded-md ${
                    isDropIndex(index, "before")
                      ? "border-t-2 border-t-primary"
                      : isDropIndex(index, "after")
                        ? "border-b-2 border-b-primary"
                        : ""
                  }`}
                  onDragOver={(event) => rowDragOver(event, index)}
                  onDrop={(event) => handleProficiencyDrop(event, index)}
                >
                  <div className="flex items-center gap-1">
                    <ReorderControls
                      noun="proficiency"
                      canMoveUp={index > 0}
                      canMoveDown={index < character.proficiencies.length - 1}
                      onMoveUp={() =>
                        setCharacter((prev) => ({ ...prev, proficiencies: moveItem(prev.proficiencies, index, index - 1) }))
                      }
                      onMoveDown={() =>
                        setCharacter((prev) => ({ ...prev, proficiencies: moveItem(prev.proficiencies, index, index + 1) }))
                      }
                      onGripDragStart={(event) => startDrag(event, index)}
                      onGripDragEnd={clearDrag}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between">
                      <span className="min-w-0 font-medium">{proficiency.name}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline">{proficiency.type.charAt(0).toUpperCase() + proficiency.type.slice(1)}</Badge>
                        <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" aria-label="Remove proficiency" onClick={() => removeProficiency(proficiency.id)}>
                          <SpriteIcon name="action-trash" s={0.22} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
