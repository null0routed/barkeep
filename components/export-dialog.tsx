"use client"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  /** includeKey = whether the exported file should carry the API key */
  onConfirm: (includeKey: boolean) => void
}

/**
 * Per-export API key decision (FIXES.MD §4.1): the save file is readable by anyone who
 * has it, so at export time the player picks whether the key is included (device
 * migration/backup) or omitted (sharing). "Without key" is the safe, default-focused
 * action; Cancel/Esc simply closes without exporting.
 */
export default function ExportDialog({ open, onClose, onConfirm }: ExportDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export save file</DialogTitle>
          <DialogDescription>This file is readable by anyone who has it. Choose what it contains:</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-4 text-sm">
          <li>
            <span className="font-medium">Without API key</span> — safe to share. Other
            devices keep their own key; re-enter it later if needed.
          </li>
          <li>
            <span className="font-medium">With API key</span> — restores this AI connection
            when imported on another device.
          </li>
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button data-autofocus onClick={() => onConfirm(false)}>
            Export without key
          </Button>
          <Button variant="outline" onClick={() => onConfirm(true)}>
            Export with key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
