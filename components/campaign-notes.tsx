"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react"
import type { CampaignNotes } from "@/lib/types"
import { NOTES_MAX_TOTAL_CHARS, notesTotalChars } from "@/lib/campaign-notes"

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

  // "current / total" counter (locked spec S2): live, amber at ≥80%, red at the cap
  const totalChars = notesTotalChars(notes)
  const counterTone =
    totalChars >= NOTES_MAX_TOTAL_CHARS
      ? "text-destructive"
      : totalChars >= NOTES_MAX_TOTAL_CHARS * 0.8
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground"

  // Total-char budget across all fields (TODO #1, locked spec): typing into one field
  // can only grow it by whatever the OTHER fields leave of the 16K budget.
  const handleFieldChange = (key: keyof CampaignNotes, rawValue: string) => {
    const usedByOthers = NOTE_FIELDS.reduce((sum, f) => (f.key === key ? sum : sum + (notes[f.key] ?? "").length), 0)
    const allowed = Math.max(0, NOTES_MAX_TOTAL_CHARS - usedByOthers)
    const value = rawValue.slice(0, allowed)
    if (value === notes[key]) return
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
              Share with DM
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
            <div className="space-y-1 text-xs">
              <div className={counterTone}>
                {totalChars.toLocaleString()} / {NOTES_MAX_TOTAL_CHARS.toLocaleString()} characters
                <span className="text-muted-foreground"> — the cap keeps your save under the browser&apos;s storage limit</span>
              </div>
              <div className="text-muted-foreground">
                {notes.lastUpdated ? `Last updated: ${notes.lastUpdated}` : "No notes yet — jot things down here while you chat."}
                {!inContext && " Off — notes are not being shared with the AI."}
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
