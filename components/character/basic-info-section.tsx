"use client"

import type React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import type { CharacterData } from "@/lib/types"

interface BasicInfoSectionProps {
  character: CharacterData
  setCharacter: React.Dispatch<React.SetStateAction<CharacterData>>
}

export default function BasicInfoSection({ character, setCharacter }: BasicInfoSectionProps) {
  const [basicInfoOpen, setBasicInfoOpen] = useState(false)
  const handleBasicInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setCharacter((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-2 card-header-compact">
        <CardTitle className="text-base">Basic Information</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setBasicInfoOpen(!basicInfoOpen)}
          aria-label={basicInfoOpen ? "Collapse basic information" : "Expand basic information"}
        >
          {basicInfoOpen ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {basicInfoOpen && (
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Character Name</Label>
              <Input id="name" name="name" value={character.name} onChange={handleBasicInfoChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="class">Class</Label>
              <Input id="class" name="class" value={character.class} onChange={handleBasicInfoChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="race">Race</Label>
              <Input id="race" name="race" value={character.race} onChange={handleBasicInfoChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Input id="level" name="level" type="number" value={character.level} onChange={handleBasicInfoChange} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="background">Background</Label>
              <Textarea
                id="background"
                name="background"
                value={character.background}
                onChange={handleBasicInfoChange}
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
