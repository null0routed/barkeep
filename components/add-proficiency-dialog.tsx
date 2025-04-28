"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Proficiency } from "@/lib/types"

interface AddProficiencyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (proficiency: Proficiency) => void
}

export default function AddProficiencyDialog({ open, onOpenChange, onAdd }: AddProficiencyDialogProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<"armor" | "weapon" | "tool" | "language" | "other">("other")

  const handleAdd = () => {
    if (!name.trim()) return

    onAdd({
      id: Date.now().toString(),
      name,
      type,
    })

    // Reset form
    setName("")
    setType("other")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Proficiency</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Proficiency name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="armor">Armor</SelectItem>
                <SelectItem value="weapon">Weapon</SelectItem>
                <SelectItem value="tool">Tool</SelectItem>
                <SelectItem value="language">Language</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
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
