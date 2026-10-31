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
import { AlertTriangleIcon } from "lucide-react"

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
 *
 * TODO #2: the dialog is a warning, so it carries the destructive (red) accent —
 * border, icon, callout, and the "with key" action — to make the risk unmistakable.
 */
export default function ExportDialog({ open, onClose, onConfirm }: ExportDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg border-destructive/60">
        <DialogHeader>
          {/* Title row and description are spaced by the header's `space-y-1.5`.
              Do NOT re-add a negative margin (-mb-*) on this row: in Tailwind v4,
              `space-y` sets the same physical property (margin-block-end) on
              `>:not(:last-child)`, so a negative margin would override it and pull
              the description up underneath the title (v3 let them collapse instead). */}
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 text-destructive" aria-hidden />
            <DialogTitle>Export save file</DialogTitle>
          </div>
          <DialogDescription>This file is readable by anyone who has it. Choose what it contains:</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-destructive dark:text-destructive/90">
            Exporting <span className="font-semibold">with the API key</span> embeds a live credential in the file.
            Anyone who receives it can spend against that account.
          </p>
        </div>
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
          <Button variant="destructive" onClick={() => onConfirm(true)}>
            Export with key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
