"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ChevronUpIcon, ChevronDownIcon, SaveIcon, RefreshCwIcon as RefreshIcon } from "lucide-react"
import type { CampaignNotes } from "@/lib/types"

interface CampaignNotesProps {
  notes: CampaignNotes
  onUpdate: (notes: CampaignNotes) => void
  onGenerateUpdate: () => Promise<void>
  isUpdating: boolean
}

export default function CampaignNotesComponent({ notes, onUpdate, onGenerateUpdate, isUpdating }: CampaignNotesProps) {
  // Ensure notes is not undefined
  const safeNotes: CampaignNotes = notes || {
    plotPoints: "",
    npcs: "",
    locations: "",
    quests: "",
    lastUpdated: "",
  }

  const [isOpen, setIsOpen] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedNotes, setEditedNotes] = useState<CampaignNotes>(safeNotes)

  const handleSave = () => {
    onUpdate(editedNotes)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedNotes(safeNotes)
    setIsEditing(false)
  }

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Campaign Notes</CardTitle>
        <div className="flex gap-2">
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => onGenerateUpdate()} disabled={isUpdating}>
              {isUpdating ? (
                <RefreshIcon className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshIcon className="h-4 w-4 mr-1" />
              )}
              Update Summary
            </Button>
          )}
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Collapse campaign notes" : "Expand campaign notes"}
          >
            {isOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plot-points">Plot Points</Label>
                <Textarea
                  id="plot-points"
                  value={editedNotes.plotPoints}
                  onChange={(e) => setEditedNotes({ ...editedNotes, plotPoints: e.target.value })}
                  rows={3}
                  placeholder="Key plot developments in your campaign..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="npcs">NPCs</Label>
                <Textarea
                  id="npcs"
                  value={editedNotes.npcs}
                  onChange={(e) => setEditedNotes({ ...editedNotes, npcs: e.target.value })}
                  rows={3}
                  placeholder="Important non-player characters..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locations">Locations</Label>
                <Textarea
                  id="locations"
                  value={editedNotes.locations}
                  onChange={(e) => setEditedNotes({ ...editedNotes, locations: e.target.value })}
                  rows={3}
                  placeholder="Significant places in your campaign..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quests">Quests</Label>
                <Textarea
                  id="quests"
                  value={editedNotes.quests}
                  onChange={(e) => setEditedNotes({ ...editedNotes, quests: e.target.value })}
                  rows={3}
                  placeholder="Current and completed quests..."
                />
              </div>
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
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-1">Plot Points</h3>
                <div className="text-sm whitespace-pre-wrap">
                  {safeNotes.plotPoints || "No plot points recorded yet."}
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-1">NPCs</h3>
                <div className="text-sm whitespace-pre-wrap">{safeNotes.npcs || "No NPCs recorded yet."}</div>
              </div>
              <div>
                <h3 className="font-medium mb-1">Locations</h3>
                <div className="text-sm whitespace-pre-wrap">{safeNotes.locations || "No locations recorded yet."}</div>
              </div>
              <div>
                <h3 className="font-medium mb-1">Quests</h3>
                <div className="text-sm whitespace-pre-wrap">{safeNotes.quests || "No quests recorded yet."}</div>
              </div>
              <div className="text-xs text-muted-foreground">Last updated: {safeNotes.lastUpdated || "Never"}</div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
