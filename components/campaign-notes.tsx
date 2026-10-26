"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react"
import type { CampaignNotes } from "@/lib/types"

interface CampaignNotesProps {
  notes: CampaignNotes
  onUpdate: (notes: CampaignNotes) => void
  /** Opt-in: when true, the notes are included as context in each model request */
  inContext: boolean
  onToggleContext: (inContext: boolean) => void
}

const NOTE_FIELDS: Array<{ key: keyof CampaignNotes; label: string; placeholder: string }> = [
  { key: "plotPoints", label: "Plot Points", placeholder: "Key plot developments in your campaign..." },
  { key: "npcs", label: "NPCs", placeholder: "Important non-player characters..." },
  { key: "locations", label: "Locations", placeholder: "Significant places in your campaign..." },
  { key: "quests", label: "Quests", placeholder: "Current and completed quests..." },
]

export default function CampaignNotesComponent({ notes, onUpdate, inContext, onToggleContext }: CampaignNotesProps) {
  // Starts collapsed: the card is an optional section, so a fresh sheet's default view
  // stays focused on character data; the chevron/label row stays visible either way
  const [isOpen, setIsOpen] = useState(false)

  const handleFieldChange = (key: keyof CampaignNotes, value: string) => {
    onUpdate({
      ...notes,
      [key]: value,
      lastUpdated: new Date().toLocaleString(),
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Campaign Notes</CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="notes-in-context" className="text-xs cursor-pointer">
              Share with AI
            </Label>
            <Switch id="notes-in-context" checked={inContext} onCheckedChange={onToggleContext} />
          </div>
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
          <div className="space-y-4">
            {NOTE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`notes-${field.key}`}>{field.label}</Label>
                <Textarea
                  id={`notes-${field.key}`}
                  value={notes[field.key]}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="resize-y"
                />
              </div>
            ))}
            <div className="text-xs text-muted-foreground">
              {notes.lastUpdated ? `Last updated: ${notes.lastUpdated}` : "No notes yet — jot things down here while you chat."}
              {!inContext && " Off — notes are not being shared with the AI."}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
