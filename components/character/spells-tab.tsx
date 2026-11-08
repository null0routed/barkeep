"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import MarkdownBody from "@/components/markdown-body"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { EditIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { CharacterData, Spell } from "@/lib/types"
import { formatSpellLevel, getSpellSchoolColor } from "./helpers"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex, swapSpellNeighbors } from "@/lib/reorder"

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

  // TODO.MD #17: reorder WITHIN the spell's level group. Arrows go through
  // swapSpellNeighbors, which is level-aware. For the grip-DnD (index-based) the
  // same rule is a target guard: a row only accepts a drop when the dragged spell
  // shares its level (see `dropTarget` on the rows), so the indicator and the drop
  // both stay inside the group.
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleSpellDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (
        sourceIndex < 0 ||
        sourceIndex >= prev.spells.length ||
        targetIndex < 0 ||
        targetIndex >= prev.spells.length ||
        prev.spells[sourceIndex]?.level !== prev.spells[targetIndex]?.level
      )
        return prev
      return { ...prev, spells: moveItem(prev.spells, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  // T5.1: per-tab name filter. Row handlers key off spell.id (not the index), so it
  // is safe to filter the per-level group arrays — empty groups then hide themselves
  // via the existing length check, which also retires their level headers.
  const [filterQuery, setFilterQuery] = useState("")
  const filtering = filterQuery.trim().length > 0
  const visibleCount = filtering
    ? character.spells.filter((spell) => itemMatches(spell, filterQuery)).length
    : character.spells.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Spells</CardTitle>
        <div className="flex items-center gap-1.5">
          <TabFilter
            noun="spells"
            query={filterQuery}
            onQueryChange={setFilterQuery}
            matched={visibleCount}
            total={character.spells.length}
          />
          <Button
            onClick={() => {
              setEditingSpell(null)
              setIsAddSpellOpen(true)
            }}
            aria-label="Add spell"
          >
            <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Spell</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {character.spells.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">No spells</div>
        ) : visibleCount === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            No matches for “{filterQuery.trim()}”
          </div>
        ) : (
          <div className="space-y-6">
            {/* Group spells by level */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
              const spellsAtLevel = character.spells.filter(
                (spell) => spell.level === level && (!filtering || itemMatches(spell, filterQuery)),
              )
              if (spellsAtLevel.length === 0) return null

              return (
                <div key={level} className="space-y-2">
                  <h3 className="font-medium">{formatSpellLevel(level)}</h3>
                  <div className="space-y-2">
                    {spellsAtLevel.map((spell) => {
                      const globalIndex = character.spells.findIndex((s) => s.id === spell.id)
                      // A legal drop target only if the dragged spell is in this row's level group.
                      const dropTarget =
                        dragIndex !== null && dragIndex !== globalIndex && character.spells[dragIndex]?.level === spell.level
                      return (
                      <div
                        key={spell.id}
                        data-reorder-row
                        className={`border rounded-md p-3 ${
                          isDropIndex(globalIndex, "before")
                            ? "border-t-2 border-t-primary"
                            : isDropIndex(globalIndex, "after")
                              ? "border-b-2 border-b-primary"
                              : ""
                        }`}
                        onDragOver={dropTarget ? (event) => rowDragOver(event, globalIndex) : undefined}
                        onDrop={dropTarget ? (event) => handleSpellDrop(event, globalIndex) : undefined}
                      >
                        <div className="flex items-center gap-1">
                          <ReorderControls
                            noun="spell"
                            canMoveUp={swapSpellNeighbors(character.spells, spell.id, "up") !== null}
                            canMoveDown={swapSpellNeighbors(character.spells, spell.id, "down") !== null}
                            onMoveUp={() =>
                              setCharacter((prev) => {
                                const next = swapSpellNeighbors(prev.spells, spell.id, "up")
                                return next ? { ...prev, spells: next } : prev
                              })
                            }
                            onMoveDown={() =>
                              setCharacter((prev) => {
                                const next = swapSpellNeighbors(prev.spells, spell.id, "down")
                                return next ? { ...prev, spells: next } : prev
                              })
                            }
                            onGripDragStart={(event) => startDrag(event, globalIndex)}
                            onGripDragEnd={clearDrag}
                          />
                          <div className="min-w-0 flex-1">
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
                          <div>
                            <MarkdownBody content={spell.description} compact />
                          </div>
                        </div>
                          </div>
                        </div>
                      </div>
                    )
                    })}
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
