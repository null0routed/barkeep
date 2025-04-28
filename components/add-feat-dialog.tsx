"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { Feat, ChatMessage } from "@/lib/types"

interface AddFeatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (feat: Feat) => void
  chatMessages: ChatMessage[]
}

export default function AddFeatDialog({ open, onOpenChange, onAdd, chatMessages }: AddFeatDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [useChat, setUseChat] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)

  const handleAdd = () => {
    if (!name.trim()) return

    onAdd({
      id: Date.now().toString(),
      name,
      description,
    })

    // Reset form
    setName("")
    setDescription("")
    setUseChat(false)
    setSelectedMessage(null)
    onOpenChange(false)
  }

  const handleSelectMessage = (content: string) => {
    setSelectedMessage(content)

    // Try to extract feat details from the message
    try {
      // Look for feat name patterns
      const nameMatch =
        content.match(/feat:?\s*([^,.\n]+)/i) ||
        content.match(/name:?\s*([^,.\n]+)/i) ||
        content.match(/ability:?\s*([^,.\n]+)/i)

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
          <DialogTitle>Add Feat</DialogTitle>
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
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Feat name" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Feat description"
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Feat name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Feat description"
                  rows={3}
                />
              </div>
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
