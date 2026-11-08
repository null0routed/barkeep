"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import MarkdownBody from "@/components/markdown-body"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, Feat } from "@/lib/types"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex } from "@/lib/reorder"

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

  // TODO.MD #17: reorder — hidden while a row is in inline edit (index-based edit
  // state; see the traits tab for the same guard).
  const reorderEnabled = editingFeatIndex === null
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleFeatDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.feats.length || targetIndex < 0 || targetIndex >= prev.feats.length) return prev
      return { ...prev, feats: moveItem(prev.feats, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  // T5.1: per-tab name filter (query lives here, so only this tab re-renders).
  // Rendering stays on the ORIGINAL array and skips non-matches, keeping the true
  // array indices the edit/delete handlers rely on.
  const [filterQuery, setFilterQuery] = useState("")
  const filtering = filterQuery.trim().length > 0
  const visibleCount = filtering
    ? character.feats.filter((feat) => itemMatches(feat, filterQuery)).length
    : character.feats.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Feats</CardTitle>
        <div className="flex items-center gap-1.5">
          <TabFilter
            noun="feats"
            query={filterQuery}
            onQueryChange={setFilterQuery}
            matched={visibleCount}
            total={character.feats.length}
          />
          <Button onClick={() => setIsAddFeatOpen(true)} aria-label="Add feat">
            <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Feat</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.feats.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No feats</div>
          ) : visibleCount === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No matches for “{filterQuery.trim()}”
            </div>
          ) : (
            character.feats.map((feat, index) =>
              filtering && !itemMatches(feat, filterQuery) ? null : (
              <div
                key={feat.id}
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
                onDrop={reorderEnabled ? (event) => handleFeatDrop(event, index) : undefined}
              >
                <div className="flex items-center gap-1">
                  {reorderEnabled && (
                    <ReorderControls
                      noun="feat"
                      canMoveUp={index > 0}
                      canMoveDown={index < character.feats.length - 1}
                      onMoveUp={() =>
                        setCharacter((prev) => ({ ...prev, feats: moveItem(prev.feats, index, index - 1) }))
                      }
                      onMoveDown={() =>
                        setCharacter((prev) => ({ ...prev, feats: moveItem(prev.feats, index, index + 1) }))
                      }
                      onGripDragStart={(event) => startDrag(event, index)}
                      onGripDragEnd={clearDrag}
                    />
                  )}
                  {editingFeatIndex === index ? (
                  <div className="min-w-0 flex-1 space-y-2">
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
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold">{feat.name}</h3>
                      <div className="flex flex-col gap-1 sm:flex-row">
                        {reorderEnabled && (
                          <ReorderControls
                            noun="feat"
                            canMoveUp={index > 0}
                            canMoveDown={index < character.feats.length - 1}
                            onMoveUp={() => setCharacter((prev) => ({ ...prev, feats: moveItem(prev.feats, index, index - 1) }))}
                            onMoveDown={() => setCharacter((prev) => ({ ...prev, feats: moveItem(prev.feats, index, index + 1) }))}
                            onGripDragStart={(event) => startDrag(event, index)}
                            onGripDragEnd={clearDrag}
                          />
                        )}
                        <Button size="icon" variant="ghost" aria-label="Edit feat" onClick={() => startEditingFeat(index)}>
                          <EditIcon className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" aria-label="Remove feat" onClick={() => removeFeat(feat.id)}>
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      <MarkdownBody content={feat.description} compact />
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
