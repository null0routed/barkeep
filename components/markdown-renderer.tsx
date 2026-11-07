"use client"

import { useMemo, memo, useState } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { splitThinkBlocks } from "@/lib/thinking"
import { stripLootFences } from "@/lib/loot"
import MarkdownBody from "./markdown-body"

interface MarkdownRendererProps {
  content: string
  // Structured model thinking reported by the endpoint (e.g. the `reasoning` field —
  // TODO.MD #3.5). Rendered collapsed above the body; when the model provides none,
  // nothing extra is shown (inline thinking tags in `content` are handled below).
  thinking?: string
}

// Memoized ThinkBlock component to prevent re-renders
const ThinkBlock = memo(({ content }: { content: string }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="my-4 border-l-4 border-primary/30 pl-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-1 p-1"
      >
        {isExpanded ? <ChevronDownIcon className="h-4 w-4 mr-1" /> : <ChevronRightIcon className="h-4 w-4 mr-1" />}
        {isExpanded ? "Hide thinking" : "Show thinking"}
      </Button>

      {isExpanded && (
        <div className="italic text-muted-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
})

ThinkBlock.displayName = "ThinkBlock"

// Main component
export default function MarkdownRenderer({ content, thinking }: MarkdownRendererProps) {
  // Memoize the processed content to avoid recalculating on every render.
  // barkeep-loot capture fences are stripped first (TODO #8 — the player never sees
  // machine blocks), then thinking tags are pulled out as collapsed blocks. The
  // markdown map + prose wrapper live in MarkdownBody (shared with the character
  // tabs — TODO.MD #13).
  const processedContent = useMemo(() => splitThinkBlocks(stripLootFences(content)), [content])

  return (
    <div>
      {/* Structured model thinking, when the endpoint provided it (TODO.MD #3.5) */}
      {thinking ? <ThinkBlock content={thinking} /> : null}
      {processedContent.map((block, index) =>
        block.type === "think" ? (
          <ThinkBlock key={index} content={block.content} />
        ) : (
          <MarkdownBody key={index} content={block.content} />
        ),
      )}
    </div>
  )
}
