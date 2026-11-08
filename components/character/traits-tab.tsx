"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import MarkdownBody from "@/components/markdown-body"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, Trait } from "@/lib/types"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex } from "@/lib/reorder"

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

  // TODO.MD #17: reorder. Arrows/grip are hidden while a row is in inline edit —
  // that tab's edit state is index-based, so moving rows around an open editor would
  // point it at a different trait (hiding is the zero-refactor safe rule).
  const reorderEnabled = editingTraitIndex === null
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleTraitDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.traits.length || targetIndex < 0 || targetIndex >= prev.traits.length) return prev
      return { ...prev, traits: moveItem(prev.traits, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  // T5.1: per-tab name filter (query lives here, so only this tab re-renders).
  // Rendering stays on the ORIGINAL array and skips non-matches, keeping the true
  // array indices the edit/delete handlers rely on.
  const [filterQuery, setFilterQuery] = useState("")
  const filtering = filterQuery.trim().length > 0
  const visibleCount = filtering
    ? character.traits.filter((trait) => itemMatches(trait, filterQuery)).length
    : character.traits.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Traits</CardTitle>
        <div className="flex items-center gap-1.5">
          <TabFilter
            noun="traits"
            query={filterQuery}
            onQueryChange={setFilterQuery}
            matched={visibleCount}
            total={character.traits.length}
          />
          <Button onClick={() => setIsAddTraitOpen(true)} aria-label="Add trait">
            <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Trait</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.traits.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No traits</div>
          ) : visibleCount === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No matches for “{filterQuery.trim()}”
            </div>
          ) : (
            character.traits.map((trait, index) =>
              filtering && !itemMatches(trait, filterQuery) ? null : (
              <div
                key={trait.id}
                data-reorder-row
                className={`border rounded-md p-3 ${
                  reorderEnabled
                    ? isDropIndex(index, "before")
                      ? "border-t-2 border-t-primary"
                      : isDropIndex(index, "after")
                        ? "border-b-2 border-b-primary"
                        : ""
                    : ""
                }`}
                onDragOver={reorderEnabled ? (event) => rowDragOver(event, index) : undefined}
                onDrop={reorderEnabled ? (event) => handleTraitDrop(event, index) : undefined}
              >
                <div className="flex items-center gap-1">
                  {reorderEnabled && (
                    <ReorderControls
                      noun="trait"
                      canMoveUp={index > 0}
                      canMoveDown={index < character.traits.length - 1}
                      onMoveUp={() =>
                        setCharacter((prev) => ({ ...prev, traits: moveItem(prev.traits, index, index - 1) }))
                      }
                      onMoveDown={() =>
                        setCharacter((prev) => ({ ...prev, traits: moveItem(prev.traits, index, index + 1) }))
                      }
                      onGripDragStart={(event) => startDrag(event, index)}
                      onGripDragEnd={clearDrag}
                    />
                  )}
                  {editingTraitIndex === index ? (
                  <div className="min-w-0 flex-1 space-y-2">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold">{trait.name}</h3>
                        <div className="text-sm text-muted-foreground">Source: {trait.source || "Unknown"}</div>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row">
                        <Button size="icon" variant="ghost" aria-label="Edit trait" onClick={() => startEditingTrait(index)}>
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" aria-label="Remove trait" onClick={() => removeTrait(trait.id)}>
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <MarkdownBody content={trait.description} compact />
                    </div>
                  </div>
                )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
