"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import MarkdownBody from "@/components/markdown-body"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import SpriteIcon from "@/components/sprite-icon"
import type { CharacterData, Equipment, ItemRarity } from "@/lib/types"
import { getRarityColor } from "./helpers"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex } from "@/lib/reorder"

interface EquipmentTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  editingEquipmentIndex: number | null
  setEditingEquipmentIndex: (index: number | null) => void
  tempEquipmentItem: Equipment
  setTempEquipmentItem: (item: Equipment) => void
  setIsAddEquipmentOpen: (open: boolean) => void
}

export default function EquipmentTab({ character, setCharacter, editingEquipmentIndex, setEditingEquipmentIndex, tempEquipmentItem, setTempEquipmentItem, setIsAddEquipmentOpen }: EquipmentTabProps) {
  const addEquipmentItem = (item: Equipment) => {
    setCharacter((prev) => ({
      ...prev,
      equipment: [...prev.equipment, item],
    }))
  }
  const updateEquipmentItem = (index: number, item: Equipment) => {
    setCharacter((prev) => {
      const newEquipment = [...prev.equipment]
      newEquipment[index] = item
      return {
        ...prev,
        equipment: newEquipment,
      }
    })
  }
  const removeEquipmentItem = (index: number) => {
    setCharacter((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((_, i) => i !== index),
    }))
  }
  const toggleEquipped = (index: number) => {
    setCharacter((prev) => {
      const newEquipment = [...prev.equipment]
      newEquipment[index] = {
        ...newEquipment[index],
        equipped: !newEquipment[index].equipped,
      }
      return {
        ...prev,
        equipment: newEquipment,
      }
    })
  }
  const startEditingEquipment = (index: number) => {
    setEditingEquipmentIndex(index)
    setTempEquipmentItem(character.equipment[index])
  }
  const cancelEditingEquipment = () => {
    setEditingEquipmentIndex(null)
  }
  const saveEquipmentEdit = () => {
    if (editingEquipmentIndex !== null) {
      updateEquipmentItem(editingEquipmentIndex, tempEquipmentItem)
      setEditingEquipmentIndex(null)
    }
  }

  // TODO.MD #17: reorder — hidden while a row is in inline edit (index-based edit
  // state; see the traits tab for the same guard).
  const reorderEnabled = editingEquipmentIndex === null
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleEquipmentDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.equipment.length || targetIndex < 0 || targetIndex >= prev.equipment.length)
        return prev
      return { ...prev, equipment: moveItem(prev.equipment, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  // T5.1: per-tab name filter (query lives here, so only this tab re-renders).
  // Rendering stays on the ORIGINAL array and skips non-matches, keeping the true
  // array indices the edit/delete handlers rely on.
  const [filterQuery, setFilterQuery] = useState("")
  const filtering = filterQuery.trim().length > 0
  const visibleCount = filtering
    ? character.equipment.filter((item) => itemMatches(item, filterQuery)).length
    : character.equipment.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Equipment</CardTitle>
        <div className="flex items-center gap-1.5">
          <TabFilter
            noun="equipment"
            query={filterQuery}
            onQueryChange={setFilterQuery}
            matched={visibleCount}
            total={character.equipment.length}
          />
          <Button onClick={() => setIsAddEquipmentOpen(true)} aria-label="Add equipment">
            <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Equipment</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.equipment.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No equipment items</div>
          ) : visibleCount === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No matches for “{filterQuery.trim()}”
            </div>
          ) : (
            character.equipment.map((item, index) =>
              filtering && !itemMatches(item, filterQuery) ? null : (
              <div
                key={index}
                data-reorder-row
                className={`hover-glow border rounded-md p-3 ${
                  reorderEnabled
                    ? isDropIndex(index, "before")
                      ? "border-t-2 border-t-primary"
                      : isDropIndex(index, "after")
                        ? "border-b-2 border-b-primary"
                        : ""
                    : ""
                }`}
                onDragOver={reorderEnabled ? (event) => rowDragOver(event, index) : undefined}
                onDrop={reorderEnabled ? (event) => handleEquipmentDrop(event, index) : undefined}
              >
                <div className="flex items-center gap-1">
                  {reorderEnabled && (
                    <ReorderControls
                      noun="equipment"
                      canMoveUp={index > 0}
                      canMoveDown={index < character.equipment.length - 1}
                      onMoveUp={() =>
                        setCharacter((prev) => ({ ...prev, equipment: moveItem(prev.equipment, index, index - 1) }))
                      }
                      onMoveDown={() =>
                        setCharacter((prev) => ({ ...prev, equipment: moveItem(prev.equipment, index, index + 1) }))
                      }
                      onGripDragStart={(event) => startDrag(event, index)}
                      onGripDragEnd={clearDrag}
                    />
                  )}
                  {editingEquipmentIndex === index ? (
                    <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={tempEquipmentItem.name}
                      onChange={(e) => setTempEquipmentItem({ ...tempEquipmentItem, name: e.target.value })}
                      placeholder="Equipment name"
                    />
                    <Textarea
                      value={tempEquipmentItem.description}
                      onChange={(e) =>
                        setTempEquipmentItem({ ...tempEquipmentItem, description: e.target.value })
                      }
                      placeholder="Description"
                      rows={2}
                    />
                    <Select
                      value={tempEquipmentItem.rarity}
                      onValueChange={(value) =>
                        setTempEquipmentItem({ ...tempEquipmentItem, rarity: value as ItemRarity })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select rarity" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="common">Common</SelectItem>
                        <SelectItem value="uncommon">Uncommon</SelectItem>
                        <SelectItem value="rare">Rare</SelectItem>
                        <SelectItem value="very rare">Very Rare</SelectItem>
                        <SelectItem value="legendary">Legendary</SelectItem>
                        <SelectItem value="artifact">Artifact</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`equipped-edit-${index}`}
                        checked={tempEquipmentItem.equipped}
                        onChange={(e) =>
                          setTempEquipmentItem({ ...tempEquipmentItem, equipped: e.target.checked })
                        }
                        className="h-4 w-4"
                      />
                      <Label htmlFor={`equipped-edit-${index}`}>Equipped</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveEquipmentEdit}>
                        <CheckIcon className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditingEquipment}>
                        <XIcon className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {item.name} {item.equipped && "(Equipped)"}
                        <Badge className={getRarityColor(item.rarity)}>
                          {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                        </Badge>
                      </div>
                      {item.description && (
                        <div className="text-sm text-muted-foreground">
                          <MarkdownBody content={item.description} compact />
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <Button
                        size="sm"
                        variant={item.equipped ? "default" : "outline"}
                        onClick={() => toggleEquipped(index)}
                      >
                        {item.equipped ? "Unequip" : "Equip"}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Edit equipment" onClick={() => startEditingEquipment(index)}>
                        <SpriteIcon name="scroll" s={0.32} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remove equipment" onClick={() => removeEquipmentItem(index)}>
                        <SpriteIcon name="action-trash" s={0.22} />
                      </Button>
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
