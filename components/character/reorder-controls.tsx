import type React from "react"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Vertical reorder rail for one character-tab row (TODO.MD #17). Sits at the row's
 * LEFT EDGE, centered on its height: up arrow on top, drag grip in the middle,
 * down arrow on bottom — the standard drag-handle placement.
 *
 * Arrows are the guaranteed path — keyboard and touch (HTML5 DnD is mouse-only) —
 * and e2e drives them; the grip is the mouse drag affordance (the owning tab wires
 * its list's DnD handlers; see the tabs' data-reorder-row rows).
 */
interface ReorderControlsProps {
  /** The noun for aria-labels/titles: "trait", "feat", "item", "equipment", "proficiency", "spell". */
  noun: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  // Drag wiring from the owning tab (undefined = this row does not start drags).
  onGripDragStart?: (event: React.DragEvent) => void
  onGripDragEnd?: () => void
}

export default function ReorderControls({
  noun,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onGripDragStart,
  onGripDragEnd,
}: ReorderControlsProps) {
  return (
    <div className="flex shrink-0 flex-col items-center self-center">
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5"
        disabled={!canMoveUp}
        aria-label={`Move ${noun} up`}
        title={`Move ${noun} up`}
        onClick={onMoveUp}
      >
        <ArrowUpIcon className="h-3 w-3" />
      </Button>
      <span
        draggable={typeof onGripDragStart === "function"}
        onDragStart={onGripDragStart}
        onDragEnd={onGripDragEnd}
        title={`Drag ${noun} to reorder`}
        className="cursor-grab px-0.5 py-1 text-muted-foreground active:cursor-grabbing"
        aria-hidden="true"
      >
        <GripVerticalIcon className="h-4 w-4" />
      </span>
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5"
        disabled={!canMoveDown}
        aria-label={`Move ${noun} down`}
        title={`Move ${noun} down`}
        onClick={onMoveDown}
      >
        <ArrowDownIcon className="h-3 w-3" />
      </Button>
    </div>
  )
}
