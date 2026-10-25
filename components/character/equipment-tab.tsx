"use client"

import type React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckIcon, EditIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import type { CharacterData, Equipment, ItemRarity } from "@/lib/types"
import { getRarityColor } from "./helpers"

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Equipment</CardTitle>
        <Button onClick={() => setIsAddEquipmentOpen(true)}>
          <PlusIcon className="h-4 w-4 mr-2" /> Add Equipment
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {character.equipment.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">No equipment items</div>
          ) : (
            character.equipment.map((item, index) => (
              <div key={index} className="flex items-center justify-between border-b pb-2">
                {editingEquipmentIndex === index ? (
                  <div className="flex-1 space-y-2">
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
                  <>
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {item.name} {item.equipped && "(Equipped)"}
                        <Badge className={getRarityColor(item.rarity)}>
                          {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
                        </Badge>
                      </div>
                      {item.description && (
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={item.equipped ? "default" : "outline"}
                        onClick={() => toggleEquipped(index)}
                      >
                        {item.equipped ? "Unequip" : "Equip"}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => startEditingEquipment(index)}>
                        <EditIcon className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeEquipmentItem(index)}>
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
