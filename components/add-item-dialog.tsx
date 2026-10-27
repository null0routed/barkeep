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
import type { InventoryItem, Equipment, ItemRarity } from "@/lib/types"
import { extractItemFields } from "@/lib/item-generator"

// Rarity values the dialog's Select actually offers (ItemRarity minus "unknown")
const GENERATABLE_RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"]

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: InventoryItem | Equipment) => void
  type: "inventory" | "equipment"
  apiUrl?: string
  apiKey?: string
  model?: string
}

export default function AddItemDialog({
  open,
  onOpenChange,
  onAdd,
  type,
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
    // Each precondition gets its own specific, actionable message so the user is
    // never left guessing *why* nothing happened (TODO.MD #4 — consistent UX).
    if (!name.trim()) {
      setGenerationError("Please enter an item name first")
      return
    }
    if (!apiKey) {
      setGenerationError("An API key is required to generate details — set one in the AI Chat settings (⚙️).")
      return
    }
    if (!apiUrl) {
      setGenerationError("An API URL is required to generate details — set one in the AI Chat settings (⚙️).")
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      // Ask for exactly the fields this dialog can show — the old "loot array +
      // type field" shape demanded data the UI never displays (TODO.MD #4).
      const rarityOptions = GENERATABLE_RARITIES.join(", ")
      const quantityLine = type === "inventory" ? ',\n  "quantity": "A positive whole number — how many were found"' : ""
      const prompt = `Provide canonical Dungeons & Dragons 5th Edition details for the item "${name}".
Respond with a single JSON object only (no prose) with exactly these fields:
{
  "name": "${name}",
  "description": "One to three sentences: what the item is, what it does, and any usage or restrictions",
  "rarity": "One of: ${rarityOptions}"${quantityLine}
}`

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
              content: `You are a D&D 5e item generator. Respond only with the requested JSON object — no prose around it.`,
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
      const content = data.choices?.[0]?.message?.content

      // Tolerate fences, prose, wrappers, and arrays (lib/item-generator.ts)
      const fields = extractItemFields(content)
      if (!fields) {
        setGenerationError("The AI didn't return usable item details — try again, or a different model.")
        return
      }

      if (fields.name) setName(fields.name)
      if (fields.description) setDescription(fields.description)
      if (fields.rarity && GENERATABLE_RARITIES.includes(fields.rarity)) {
        setRarity(fields.rarity as ItemRarity)
      }
      if (type === "inventory" && fields.quantity) setQuantity(fields.quantity)
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
                  disabled={isGenerating || !name.trim()}
                  title={
                    !apiKey
                      ? "An API key is required — set one in the AI Chat settings (⚙️)"
                      : "Generate name, description, and rarity from a short item name"
                  }
                  onClick={generateItemDetails}
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
              {!apiKey && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Tip: &quot;Generate Details&quot; needs an API key — set one in the AI Chat settings (⚙️) — before it can run.
                </p>
              )}
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
