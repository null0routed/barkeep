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
import type { InventoryItem, Equipment, ItemRarity, ChatMessage } from "@/lib/types"
import { extractItemFields } from "@/lib/item-generator"
import { buildGenerationContext, buildGeneratorMessages, GENERATABLE_RARITIES } from "@/lib/item-seed"
import type { LootEntry } from "@/lib/loot"
import { resolveSystemPrompt } from "@/lib/system-prompt"

// How long to wait for the model before giving up. 60 s on purpose (owner decision,
// Phase B): slow endpoints — and local models (e.g. Ollama) still loading in — get
// time to answer instead of a bare "aborted" error.
const GENERATION_TIMEOUT_MS = 60_000

interface AddItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (item: InventoryItem | Equipment) => void
  type: "inventory" | "equipment"
  apiUrl?: string
  apiKey?: string
  model?: string
  // "Generate Details" context (TODO #8, T8.2): captured loot finds and the chat
  // history the item may have been presented through — both optional; without them
  // the generator runs in plain canonical mode. The player's custom system prompt
  // ("" = built-in DM prompt) carries the campaign's game system.
  loot?: LootEntry[]
  chatMessages?: ChatMessage[]
  systemPrompt?: string
}

export default function AddItemDialog({
  open,
  onOpenChange,
  onAdd,
  type,
  apiUrl = "https://api.openai.com/v1/chat/completions",
  apiKey = "",
  model = "gpt-4o-mini",
  loot = [],
  chatMessages = [],
  systemPrompt = "",
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
    // Name (and an API URL) are required — but an API key is NOT. Keyless
    // providers (e.g. local Ollama) are fully supported; we only attach an
    // Authorization header when a key is actually set (see fetch below).
    if (!name.trim()) {
      setGenerationError("Please enter an item name first")
      return
    }
    if (!apiUrl) {
      setGenerationError("The API URL is empty — set one in the AI Chat settings (⚙️).")
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      // Context seeding (TODO.MD #8, T8.2): exact captured-loot name match → canonical
      // entry; close name → ranked candidates the model adjudicates; else a bounded
      // recent-chat slice; else plain canonical details. Wording is system-NEUTRAL
      // (owner revision 2026-10-30) — the campaign's game system arrives via its DM
      // prompt, never a hard-coded ruleset.
      const itemName = name.trim()
      const context = buildGenerationContext(itemName, loot, chatMessages)
      const { system, user } = buildGeneratorMessages({
        name: itemName,
        type,
        context,
        campaignPrompt: resolveSystemPrompt(systemPrompt),
      })

      const response = await fetch(apiUrl, {
        method: "POST",
        // No timeout = a hung endpoint spins the loader forever (Phase B audit gap).
        signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          // Only send auth when a key actually exists. Keyless providers (e.g. local
          // Ollama) must not receive a blank `Bearer` token, and their absence is
          // perfectly fine — so the key is optional, not a requirement.
          ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: 0.7,
        }),
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `The server rejected the request (HTTP ${response.status}) — it likely requires an API key. Set one in the AI Chat settings (⚙️), or point the API URL at a keyless endpoint (e.g. a local Ollama).`,
          )
        }
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
      // A timed-out request (AbortSignal.timeout) aborts as TimeoutError/AbortError —
      // say what happened and that the clock covers slow/local models, instead of
      // falling through to the opaque generic message.
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        setGenerationError(
          `The AI didn't respond within ${GENERATION_TIMEOUT_MS / 1000} s — try again, or check the endpoint.`,
        )
        return
      }
      // Surface the specific reason (e.g. 401/403 "key required") when we have one,
      // and fall back to a generic message only when the error is opaque.
      setGenerationError(
        error instanceof Error && error.message
          ? error.message
          : "Failed to generate item details. Check your API settings.",
      )
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
                  title="Generate name, description, and rarity from a short item name"
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
