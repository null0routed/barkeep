"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChevronUpIcon, ChevronDownIcon, SaveIcon, RefreshCwIcon as RefreshIcon } from "lucide-react"
import type { CampaignSummary } from "@/lib/types"

interface CampaignSummaryProps {
  summary: CampaignSummary
  onUpdate: (summary: CampaignSummary) => void
  onGenerateUpdate: () => Promise<void>
  isUpdating: boolean
}

export default function CampaignSummaryComponent({
  summary,
  onUpdate,
  onGenerateUpdate,
  isUpdating,
}: CampaignSummaryProps) {
  // Ensure summary is not undefined
  const safeSummary: CampaignSummary = summary || {
    conversationSummary: "",
    plotPoints: "",
    npcs: "",
    locations: "",
    quests: "",
    lastUpdated: "",
  }

  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedSummary, setEditedSummary] = useState<CampaignSummary>(safeSummary)
  const [activeTab, setActiveTab] = useState("conversation")

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
        <CardTitle className="text-base">Campaign Summary</CardTitle>
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
            aria-label={isOpen ? "Collapse campaign summary" : "Expand campaign summary"}
          >
            {isOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-5 mb-4">
                  <TabsTrigger value="conversation">Conversation</TabsTrigger>
                  <TabsTrigger value="plot">Plot</TabsTrigger>
                  <TabsTrigger value="npcs">NPCs</TabsTrigger>
                  <TabsTrigger value="locations">Locations</TabsTrigger>
                  <TabsTrigger value="quests">Quests</TabsTrigger>
                </TabsList>

                <TabsContent value="conversation" className="space-y-2">
                  <Label htmlFor="conversation-summary">Conversation Summary</Label>
                  <Textarea
                    id="conversation-summary"
                    value={editedSummary.conversationSummary}
                    onChange={(e) => setEditedSummary({ ...editedSummary, conversationSummary: e.target.value })}
                    rows={5}
                    placeholder="Summary of the conversation so far..."
                  />
                </TabsContent>

                <TabsContent value="plot" className="space-y-2">
                  <Label htmlFor="plot-points">Plot Points</Label>
                  <Textarea
                    id="plot-points"
                    value={editedSummary.plotPoints}
                    onChange={(e) => setEditedSummary({ ...editedSummary, plotPoints: e.target.value })}
                    rows={5}
                    placeholder="Key plot developments in your campaign..."
                  />
                </TabsContent>

                <TabsContent value="npcs" className="space-y-2">
                  <Label htmlFor="npcs">NPCs</Label>
                  <Textarea
                    id="npcs"
                    value={editedSummary.npcs}
                    onChange={(e) => setEditedSummary({ ...editedSummary, npcs: e.target.value })}
                    rows={5}
                    placeholder="Important non-player characters..."
                  />
                </TabsContent>

                <TabsContent value="locations" className="space-y-2">
                  <Label htmlFor="locations">Locations</Label>
                  <Textarea
                    id="locations"
                    value={editedSummary.locations}
                    onChange={(e) => setEditedSummary({ ...editedSummary, locations: e.target.value })}
                    rows={5}
                    placeholder="Significant places in your campaign..."
                  />
                </TabsContent>

                <TabsContent value="quests" className="space-y-2">
                  <Label htmlFor="quests">Quests</Label>
                  <Textarea
                    id="quests"
                    value={editedSummary.quests}
                    onChange={(e) => setEditedSummary({ ...editedSummary, quests: e.target.value })}
                    rows={5}
                    placeholder="Current and completed quests..."
                  />
                </TabsContent>
              </Tabs>

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
              <Tabs defaultValue="conversation">
                <TabsList className="grid grid-cols-5 mb-4">
                  <TabsTrigger value="conversation">Conversation</TabsTrigger>
                  <TabsTrigger value="plot">Plot</TabsTrigger>
                  <TabsTrigger value="npcs">NPCs</TabsTrigger>
                  <TabsTrigger value="locations">Locations</TabsTrigger>
                  <TabsTrigger value="quests">Quests</TabsTrigger>
                </TabsList>

                <TabsContent value="conversation">
                  <div className="whitespace-pre-wrap">
                    {safeSummary.conversationSummary || "No conversation summary yet."}
                  </div>
                </TabsContent>

                <TabsContent value="plot">
                  <div className="whitespace-pre-wrap">{safeSummary.plotPoints || "No plot points recorded yet."}</div>
                </TabsContent>

                <TabsContent value="npcs">
                  <div className="whitespace-pre-wrap">{safeSummary.npcs || "No NPCs recorded yet."}</div>
                </TabsContent>

                <TabsContent value="locations">
                  <div className="whitespace-pre-wrap">{safeSummary.locations || "No locations recorded yet."}</div>
                </TabsContent>

                <TabsContent value="quests">
                  <div className="whitespace-pre-wrap">{safeSummary.quests || "No quests recorded yet."}</div>
                </TabsContent>
              </Tabs>

              <div className="text-xs text-muted-foreground">Last updated: {safeSummary.lastUpdated || "Never"}</div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
