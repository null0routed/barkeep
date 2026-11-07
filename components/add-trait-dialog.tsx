"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Loader2Icon, WandIcon } from "lucide-react"
import type { Trait, ChatMessage } from "@/lib/types"
import { extractItemFields } from "@/lib/item-generator"
import { buildGenerationContext, buildGeneratorMessages } from "@/lib/item-seed"
import { resolveSystemPrompt } from "@/lib/system-prompt"

// How long to wait for the model before giving up. 60 s on purpose (owner decision,
// Phase B): slow endpoints — and local models (e.g. Ollama) still loading in — get
// time to answer instead of a bare "aborted" error. Mirrors add-item-dialog.tsx.
const GENERATION_TIMEOUT_MS = 60_000

interface AddTraitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (trait: Trait) => void
  apiUrl?: string
  apiKey?: string
  model?: string
  // "Generate Details" context (TODO.MD #20): the chat history the trait may have
  // been presented through — resolved the moment generation runs (T3.2 accessor).
  getChatMessages: () => ChatMessage[]
  // The player's custom DM prompt ("" = built-in) carries the campaign's game system.
  systemPrompt?: string
}

export default function AddTraitDialog({
  open,
  onOpenChange,
  onAdd,
  apiUrl = "https://api.openai.com/v1/chat/completions",
  apiKey = "",
  model = "gpt-4o-mini",
  getChatMessages,
  systemPrompt = "",
}: AddTraitDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [source, setSource] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const handleAdd = () => {
    if (!name.trim()) return

    onAdd({
      id: crypto.randomUUID(),
      name,
      description,
      source,
    })

    // Reset form
    setName("")
    setDescription("")
    setSource("")
    onOpenChange(false)
  }

  const generateTraitDetails = async () => {
    // Name (and an API URL) are required — but an API key is NOT. Keyless
    // providers (e.g. local Ollama) are fully supported (see fetch below).
    if (!name.trim()) {
      setGenerationError("Please enter a trait name first")
      return
    }
    if (!apiUrl) {
      setGenerationError("The API URL is empty — set one in the Chat Settings (⚙️).")
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      // Traits are not loot entries, so no captured-entry stage — the generator
      // falls to the bounded recent-chat slice (what the DM actually said), then
      // plain canonical. Same fetch/timeout/auth pattern as the item dialog.
      const traitName = name.trim()
      const context = buildGenerationContext(traitName, [], getChatMessages())
      const { system, user } = buildGeneratorMessages({
        name: traitName,
        type: "trait",
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
            `The server rejected the request (HTTP ${response.status}) — it likely requires an API key. Set one in the Chat Settings (⚙️), or point the API URL at a keyless endpoint (e.g. a local Ollama).`,
          )
        }
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      // Tolerate fences, prose, wrappers, and arrays (lib/item-generator.ts)
      const fields = extractItemFields(content)
      if (!fields) {
        setGenerationError("The AI didn't return usable trait details — try again, or a different model.")
        return
      }

      if (fields.name) setName(fields.name)
      if (fields.description) setDescription(fields.description)
      if (fields.source) setSource(fields.source)
    } catch (error) {
      console.error("Error generating trait:", error)
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
          : "Failed to generate trait details. Check your API settings.",
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Trait</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="name">Name</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isGenerating || !name.trim()}
                title="Generate name, description, and source from a short trait name"
                onClick={generateTraitDetails}
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
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Trait name" />
            {generationError && <p className="text-xs text-destructive">{generationError}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Trait description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input id="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g., Race, Background" />
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
