"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { InventoryItem, Equipment, ChatMessage, ItemRarity } from "@/lib/types"

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: InventoryItem | Equipment) => void
  type: "inventory" | "equipment"
  chatMessages: ChatMessage[]
}

export default function AddItemDialog({ open, onOpenChange, onAdd, type, chatMessages }: AddItemDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [equipped, setEquipped] = useState(false)
  const [rarity, setRarity] = useState<ItemRarity>("common")
  const [useChat, setUseChat] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)

  const handleAdd = () => {
    if (!name.trim()) return

    if (type === "inventory") {
      onAdd({
        name,
        description,
        quantity,
        rarity,
      })
    } else {
      onAdd({
        name,
        description,
        equipped,
        rarity,
      })
    }

    // Reset form
    setName("")
    setDescription("")
    setQuantity(1)
    setEquipped(false)
    setRarity("common")
    setUseChat(false)
    setSelectedMessage(null)
    onOpenChange(false)
  }

  const handleSelectMessage = (content: string) => {
    setSelectedMessage(content)

    // Try to extract item details from the message
    try {
      // Look for item name patterns
      const nameMatch =
        content.match(/item:?\s*([^,.\n]+)/i) ||
        content.match(/name:?\s*([^,.\n]+)/i) ||
        content.match(/weapon:?\s*([^,.\n]+)/i) ||
        content.match(/armor:?\s*([^,.\n]+)/i)

      if (nameMatch && nameMatch[1]) {
        setName(nameMatch[1].trim())
      }

      // Look for description patterns
      const descMatch = content.match(/description:?\s*([^.]+\.)/i) || content.match(/desc:?\s*([^.]+\.)/i)

      if (descMatch && descMatch[1]) {
        setDescription(descMatch[1].trim())
      } else {
        // If no specific description pattern, try to use the whole message as context
        setDescription(content.substring(0, 150) + (content.length > 150 ? "..." : ""))
      }

      // Look for quantity patterns if it's an inventory item
      if (type === "inventory") {
        const quantityMatch =
          content.match(/quantity:?\s*(\d+)/i) || content.match(/amount:?\s*(\d+)/i) || content.match(/(\d+)\s*items?/i)

        if (quantityMatch && quantityMatch[1]) {
          setQuantity(Number.parseInt(quantityMatch[1]))
        }
      }

      // Look for equipped status if it's equipment
      if (type === "equipment") {
        const equippedMatch = content.match(/equipped:?\s*(yes|true)/i) || content.match(/wearing:?\s*(yes|true)/i)

        setEquipped(!!equippedMatch)
      }

      // Look for rarity patterns
      const rarityMatch = content.match(/rarity:?\s*(common|uncommon|rare|very rare|legendary|artifact)/i)
      if (rarityMatch && rarityMatch[1]) {
        setRarity(rarityMatch[1].toLowerCase() as ItemRarity)
      }
    } catch (error) {
      console.error("Error parsing message:", error)
      // If parsing fails, just use the message as description
      setDescription(content.substring(0, 150) + (content.length > 150 ? "..." : ""))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add {type === "inventory" ? "Inventory Item" : "Equipment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <Switch id="use-chat" checked={useChat} onCheckedChange={setUseChat} />
            <Label htmlFor="use-chat">Pull from chat</Label>
          </div>

          {useChat ? (
            <div className="space-y-4">
              <div className="max-h-[300px] overflow-y-auto border rounded-md p-2">
                {chatMessages.filter((msg) => msg.role === "assistant").length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">No assistant messages available</div>
                ) : (
                  chatMessages
                    .filter((msg) => msg.role === "assistant")
                    .map((message) => (
                      <div
                        key={message.id}
                        className={`p-2 my-2 rounded-md cursor-pointer hover:bg-muted ${
                          selectedMessage === message.content ? "bg-muted border-2 border-primary" : ""
                        }`}
                        onClick={() => handleSelectMessage(message.content)}
                      >
                        {message.content.length > 100 ? `${message.content.substring(0, 100)}...` : message.content}
                      </div>
                    ))
                )}
              </div>

              {selectedMessage && (
                <div className="space-y-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Item description"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rarity">Rarity</Label>
                    <Select value={rarity} onValueChange={(value) => setRarity(value as ItemRarity)}>
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
                  </div>

                  {type === "inventory" && (
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input
                        id="quantity"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Number.parseInt(e.target.value) || 1)}
                        min={1}
                      />
                    </div>
                  )}

                  {type === "equipment" && (
                    <div className="flex items-center space-x-2">
                      <Switch id="equipped" checked={equipped} onCheckedChange={setEquipped} />
                      <Label htmlFor="equipped">Equipped</Label>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Item description"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rarity">Rarity</Label>
                <Select value={rarity} onValueChange={(value) => setRarity(value as ItemRarity)}>
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
              </div>

              {type === "inventory" && (
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number.parseInt(e.target.value) || 1)}
                    min={1}
                  />
                </div>
              )}

              {type === "equipment" && (
                <div className="flex items-center space-x-2">
                  <Switch id="equipped" checked={equipped} onCheckedChange={setEquipped} />
                  <Label htmlFor="equipped">Equipped</Label>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!name.trim()}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
