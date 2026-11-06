"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, InventoryItem, ItemRarity } from "@/lib/types"
import { getRarityColor } from "./helpers"
import TabFilter from "../tab-filter"
import { itemMatches } from "@/lib/filter"

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
              <div key={index} className="flex items-center justify-between border-b pb-2">
                {editingInventoryIndex === index ? (
                  <div className="flex-1 space-y-2">
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
                  <>
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {item.name} {item.quantity > 1 && `(${item.quantity})`}
                        <Badge className={getRarityColor(item.rarity)}>
                          {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                        </Badge>
                      </div>
                      {item.description && (
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <Button size="icon" variant="ghost" aria-label="Edit item" onClick={() => startEditingInventory(index)}>
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="hover:bg-destructive/10 hover:text-destructive" aria-label="Remove item" onClick={() => removeInventoryItem(index)}>
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
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
