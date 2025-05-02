"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ChevronUpIcon, ChevronDownIcon, SaveIcon } from "lucide-react"
import type { ConversationSummary } from "@/lib/types"

interface ConversationSummaryProps {
  summary: ConversationSummary
  onUpdate: (summary: ConversationSummary) => void
}

export default function ConversationSummaryComponent({ summary, onUpdate }: ConversationSummaryProps) {
  // Ensure summary is not undefined
  const safeSummary: ConversationSummary = summary || { summary: "", lastUpdated: "" }

  const [isOpen, setIsOpen] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState<ConversationSummary>(safeSummary)

  const handleSave = () => {
    onUpdate(editedSummary)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedSummary(safeSummary)
    setIsEditing(false)
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Conversation Summary</CardTitle>
        <div className="flex gap-2">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Collapse conversation summary" : "Expand conversation summary"}
          >
            {isOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <Textarea
                value={editedSummary.summary}
                onChange={(e) => setEditedSummary({ ...editedSummary, summary: e.target.value })}
                rows={5}
                placeholder="Summary of the conversation so far..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  <SaveIcon className="h-4 w-4 mr-1" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="whitespace-pre-wrap">{safeSummary.summary || "No conversation summary yet."}</div>
              <div className="text-xs text-muted-foreground mt-2">
                Last updated: {safeSummary.lastUpdated || "Never"}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
