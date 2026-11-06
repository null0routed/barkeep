"use client"
import Image from "next/image"
import { CoffeeIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface AboutModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AboutModal({ open, onOpenChange }: AboutModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Smaller than the instructions — an overview, not a manual. Centered and
          airy; no bullets (two labeled lines read better without them here). */}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg">
            {/* The same 192px badge the header uses — 28px badge, supersampled */}
            <Image
              src="/android-chrome-192x192.png"
              alt="Barkeep logo"
              width={28}
              height={28}
              className="rounded"
            />
            Barkeep
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-center text-sm">
          <p className="leading-relaxed">
            A serverless (ish) D&amp;D character sheet with an AI Dungeon Master — track the party,
            run the story with the DM, and let it capture loot and paint major moments. Your
            character, chat, and settings live in your browser, with export files for backup.
          </p>

          <div className="space-y-1">
            <p className="leading-relaxed">
              <strong>Open source:</strong> GNU AGPL v3.0 — the full license ships in the repository (
              <span className="font-mono text-xs">LICENSE</span>)
            </p>
            {/* The © is a rights statement on the work — fully compatible with AGPL 3.0
                (whose §5 even requires retaining such notices). Grouped with the
                license line: legal rights, together. */}
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Barkeep.cloudkern.com
            </p>
          </div>

          <p className="leading-relaxed">
            <strong>Source &amp; issues:</strong>{" "}
            <a
              href="https://github.com/null0routed/barkeep"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:no-underline"
            >
              github.com/null0routed/barkeep
            </a>
          </p>

          <p className="text-muted-foreground">
            Brought to you with
            <span className="mx-1 inline-flex align-middle">
              <CoffeeIcon className="h-4 w-4" aria-label="coffee" />
            </span>
            by Andy Kern (null0routed)
          </p>
        </div>

        <div className="mt-5 flex justify-center">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
