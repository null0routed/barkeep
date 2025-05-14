"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2Icon, WandIcon } from "lucide-react"
import type { InventoryItem, Equipment, ChatMessage, ItemRarity } from "@/lib/types"

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: InventoryItem | Equipment) => void
  type: "inventory" | "equipment"
  chatMessages: ChatMessage[]
  apiUrl?: string
  apiKey?: string
  model?: string
}

export default function AddItemDialog({
  open,
  onOpenChange,
  onAdd,
  type,
  chatMessages,
  apiUrl = "https://api.openai.com/v1/chat/completions",
  apiKey = "",
  model = "gpt-4o-mini",
}: AddItemDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [equipped, setEquipped] = useState(false)
  const [rarity, setRarity] = useState<ItemRarity>("common")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

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
    onOpenChange(false)
  }

  const generateItemDetails = async () => {
    if (!name.trim() || !apiKey || !apiUrl) {
      setGenerationError("Please enter an item name and ensure API settings are configured")
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const prompt = `Provide a stat block for the D&D item ${name}. The item should be a JSON object enclosed in a code block formatted with json, containing an array of loot items.

Each item must have:
name (string): The item name
type (string): One of weapon, armor, consumable, tool, or misc
rarity (string): e.g., common, uncommon, rare, very rare, legendary
description (string): A brief explanation of what the item does
quantity (number): How many were found

Always end loot sections with a properly formatted JSON object like this:

\`\`\`json
{
  "loot": [
    {
      "name": "Potion of Healing",
      "type": "consumable",
      "rarity": "common",
      "description": "Restores 2d4 + 2 HP when consumed.",
      "quantity": 1
    }
  ]
}
\`\`\``

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "You are a helpful D&D item generator. Respond only with the requested JSON format.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices[0].message.content

      // Extract JSON from the response
      const jsonMatch = content.match(/```json\s*({[\s\S]*?})\s*```/)

      if (jsonMatch && jsonMatch[1]) {
        try {
          const parsedData = JSON.parse(jsonMatch[1])
          if (parsedData.loot && parsedData.loot.length > 0) {
            const item = parsedData.loot[0]
            setName(item.name)
            setDescription(item.description)

            if (type === "inventory" && item.quantity) {
              setQuantity(item.quantity)
            }

            if (
              item.rarity &&
              ["common", "uncommon", "rare", "very rare", "legendary", "artifact"].includes(item.rarity.toLowerCase())
            ) {
              setRarity(item.rarity.toLowerCase() as ItemRarity)
            }
          }
        } catch (error) {
          console.error("Error parsing JSON:", error)
          setGenerationError("Failed to parse the generated item data")
        }
      } else {
        setGenerationError("The AI didn't return properly formatted item data")
      }
    } catch (error) {
      console.error("Error generating item:", error)
      setGenerationError("Failed to generate item details. Check your API settings.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add {type === "inventory" ? "Inventory Item" : "Equipment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="name">Name</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={generateItemDetails}
                  disabled={isGenerating || !name.trim() || !apiKey}
                >
                  {isGenerating ? (
                    <>
                      <Loader2Icon className="h-4 w-4 mr-1 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <WandIcon className="h-4 w-4 mr-1" /> Generate Details
                    </>
                  )}
                </Button>
              </div>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
              {generationError && <p className="text-xs text-destructive">{generationError}</p>}
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
