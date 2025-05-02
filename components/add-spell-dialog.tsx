"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Spell, SpellSchool } from "@/lib/types"

interface AddSpellDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (spell: Spell) => void
  editingSpell?: Spell | null
}

export default function AddSpellDialog({ open, onOpenChange, onAdd, editingSpell }: AddSpellDialogProps) {
  const [spell, setSpell] = useState<Spell>(
    editingSpell || {
      id: "",
      name: "",
      description: "",
      level: 0,
      school: "evocation",
      range: "",
      target: "",
      verbal: false,
      somatic: false,
      material: false,
      materialComponents: "",
      prepared: false,
    },
  )

  const handleAdd = () => {
    if (!spell.name.trim()) return

    const newSpell: Spell = {
      ...spell,
      id: spell.id || Date.now().toString(),
    }

    onAdd(newSpell)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingSpell ? "Edit Spell" : "Add Spell"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={spell.name}
                onChange={(e) => setSpell({ ...spell, name: e.target.value })}
                placeholder="Spell name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select
                value={spell.level.toString()}
                onValueChange={(value) => setSpell({ ...spell, level: Number.parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Cantrip</SelectItem>
                  <SelectItem value="1">1st Level</SelectItem>
                  <SelectItem value="2">2nd Level</SelectItem>
                  <SelectItem value="3">3rd Level</SelectItem>
                  <SelectItem value="4">4th Level</SelectItem>
                  <SelectItem value="5">5th Level</SelectItem>
                  <SelectItem value="6">6th Level</SelectItem>
                  <SelectItem value="7">7th Level</SelectItem>
                  <SelectItem value="8">8th Level</SelectItem>
                  <SelectItem value="9">9th Level</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="school">School</Label>
            <Select
              value={spell.school}
              onValueChange={(value) => setSpell({ ...spell, school: value as SpellSchool })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select school" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abjuration">Abjuration</SelectItem>
                <SelectItem value="conjuration">Conjuration</SelectItem>
                <SelectItem value="divination">Divination</SelectItem>
                <SelectItem value="enchantment">Enchantment</SelectItem>
                <SelectItem value="evocation">Evocation</SelectItem>
                <SelectItem value="illusion">Illusion</SelectItem>
                <SelectItem value="necromancy">Necromancy</SelectItem>
                <SelectItem value="transmutation">Transmutation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="range">Range</Label>
              <Input
                id="range"
                value={spell.range}
                onChange={(e) => setSpell({ ...spell, range: e.target.value })}
                placeholder="e.g., 60 feet, Self, Touch"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">Target</Label>
              <Input
                id="target"
                value={spell.target}
                onChange={(e) => setSpell({ ...spell, target: e.target.value })}
                placeholder="e.g., One creature, 20-foot radius"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Components</Label>
            <div className="flex space-x-4 items-center">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="verbal"
                  checked={spell.verbal}
                  onCheckedChange={(checked) => setSpell({ ...spell, verbal: checked as boolean })}
                />
                <Label htmlFor="verbal" className="text-sm">
                  Verbal (V)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="somatic"
                  checked={spell.somatic}
                  onCheckedChange={(checked) => setSpell({ ...spell, somatic: checked as boolean })}
                />
                <Label htmlFor="somatic" className="text-sm">
                  Somatic (S)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="material"
                  checked={spell.material}
                  onCheckedChange={(checked) => setSpell({ ...spell, material: checked as boolean })}
                />
                <Label htmlFor="material" className="text-sm">
                  Material (M)
                </Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="materialComponents">Material Components</Label>
            <Input
              id="materialComponents"
              value={spell.materialComponents}
              onChange={(e) => setSpell({ ...spell, materialComponents: e.target.value })}
              placeholder="e.g., a pinch of sulfur"
              disabled={!spell.material}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={spell.description}
              onChange={(e) => setSpell({ ...spell, description: e.target.value })}
              placeholder="Spell description"
              rows={5}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="prepared"
              checked={spell.prepared}
              onCheckedChange={(checked) => setSpell({ ...spell, prepared: checked as boolean })}
            />
            <Label htmlFor="prepared">Prepared</Label>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!spell.name.trim()}>
              {editingSpell ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
