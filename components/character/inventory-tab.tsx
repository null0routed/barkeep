"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import MarkdownBody from "@/components/markdown-body"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckIcon, PlusIcon, XIcon } from "lucide-react"
import SpriteIcon from "@/components/sprite-icon"
import type { CharacterData, InventoryItem, ItemRarity } from "@/lib/types"
import { getRarityColor } from "./helpers"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"
import ReorderControls from "./reorder-controls"
import { useListDrag } from "./use-list-drag"
import { moveItem, dropInsertIndex } from "@/lib/reorder"

interface InventoryTabProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
  editingInventoryIndex: number | null
  setEditingInventoryIndex: (index: number | null) => void
  tempInventoryItem: InventoryItem
  setTempInventoryItem: (item: InventoryItem) => void
  setIsAddInventoryOpen: (open: boolean) => void
}

export default function InventoryTab({ character, setCharacter, editingInventoryIndex, setEditingInventoryIndex, tempInventoryItem, setTempInventoryItem, setIsAddInventoryOpen }: InventoryTabProps) {
  const addInventoryItem = (item: InventoryItem) => {
    setCharacter((prev) => ({
      ...prev,
      inventory: [...prev.inventory, item],
    }))
  }
  const updateInventoryItem = (index: number, item: InventoryItem) => {
    setCharacter((prev) => {
      const newInventory = [...prev.inventory]
      newInventory[index] = item
      return {
        ...prev,
        inventory: newInventory,
      }
    })
  }
  const removeInventoryItem = (index: number) => {
    setCharacter((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((_, i) => i !== index),
    }))
  }
  const startEditingInventory = (index: number) => {
    setEditingInventoryIndex(index)
    setTempInventoryItem(character.inventory[index])
  }
  const cancelEditingInventory = () => {
    setEditingInventoryIndex(null)
  }
  const saveInventoryEdit = () => {
    if (editingInventoryIndex !== null) {
      updateInventoryItem(editingInventoryIndex, tempInventoryItem)
      setEditingInventoryIndex(null)
    }
  }

  // TODO.MD #17: reorder — hidden while a row is in inline edit (index-based edit
  // state; see the traits tab for the same guard).
  const reorderEnabled = editingInventoryIndex === null
  const { dragIndex, startDrag, clearDrag, rowDragOver, isDropIndex } = useListDrag()
  const handleItemDrop = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    const sourceIndex = dragIndex
    clearDrag()
    if (sourceIndex === null || sourceIndex === targetIndex) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const edge: "before" | "after" = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setCharacter((prev) => {
      if (sourceIndex < 0 || sourceIndex >= prev.inventory.length || targetIndex < 0 || targetIndex >= prev.inventory.length)
        return prev
      return { ...prev, inventory: moveItem(prev.inventory, sourceIndex, dropInsertIndex(sourceIndex, targetIndex, edge)) }
    })
  }

  // T5.1: per-tab name filter. The query lives here so only THIS tab re-renders on
  // each keystroke. The list below stays the ORIGINAL array (skipping non-matches) —
  // the row handlers (edit/delete) key off the true array index, which a filtered
  // copy would not preserve.
  const [filterQuery, setFilterQuery] = useState("")
  const filtering = filterQuery.trim().length > 0
  const visibleCount = filtering
    ? character.inventory.filter((item) => itemMatches(item, filterQuery)).length
    : character.inventory.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Inventory</CardTitle>
        <div className="flex items-center gap-1.5">
          <TabFilter
            noun="items"
            query={filterQuery}
            onQueryChange={setFilterQuery}
            matched={visibleCount}
            total={character.inventory.length}
          />
          <Button onClick={() => setIsAddInventoryOpen(true)} aria-label="Add item">
            {/* Mobile (below sm): icon-only, like the composer's Send — the labeled
                header is crowded at phone scale; the aria-label keeps it named. */}
            <PlusIcon className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Add Item</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.inventory.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No items in inventory</div>
          ) : visibleCount === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No matches for “{filterQuery.trim()}”
            </div>
          ) : (
            character.inventory.map((item, index) =>
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
                onDrop={reorderEnabled ? (event) => handleItemDrop(event, index) : undefined}
              >
                <div className="flex items-center gap-1">
                  {reorderEnabled && (
                    <ReorderControls
                      noun="item"
                      canMoveUp={index > 0}
                      canMoveDown={index < character.inventory.length - 1}
                      onMoveUp={() =>
                        setCharacter((prev) => ({ ...prev, inventory: moveItem(prev.inventory, index, index - 1) }))
                      }
                      onMoveDown={() =>
                        setCharacter((prev) => ({ ...prev, inventory: moveItem(prev.inventory, index, index + 1) }))
                      }
                      onGripDragStart={(event) => startDrag(event, index)}
                      onGripDragEnd={clearDrag}
                    />
                  )}
                  {editingInventoryIndex === index ? (
                    <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={tempInventoryItem.name}
                        onChange={(e) => setTempInventoryItem({ ...tempInventoryItem, name: e.target.value })}
                        placeholder="Item name"
                      />
                      <Input
                        type="number"
                        value={tempInventoryItem.quantity}
                        onChange={(e) =>
                          setTempInventoryItem({
                            ...tempInventoryItem,
                            quantity: Number.parseInt(e.target.value) || 1,
                          })
                        }
                        className="w-20"
                        min={1}
                      />
                    </div>
                    <Textarea
                      value={tempInventoryItem.description}
                      onChange={(e) =>
                        setTempInventoryItem({ ...tempInventoryItem, description: e.target.value })
                      }
                      placeholder="Description"
                      rows={2}
                    />
                    <Select
                      value={tempInventoryItem.rarity}
                      onValueChange={(value) =>
                        setTempInventoryItem({ ...tempInventoryItem, rarity: value as ItemRarity })
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
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveInventoryEdit}>
                        <CheckIcon className="h-4 w-4 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditingInventory}>
                        <XIcon className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {item.name} {item.quantity > 1 && `(${item.quantity})`}
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
                      <Button size="icon" variant="ghost" aria-label="Edit item" onClick={() => startEditingInventory(index)}>
                        <SpriteIcon name="scroll" s={0.32} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Remove item" onClick={() => removeInventoryItem(index)}>
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
