"use client"

import { useState, useMemo, memo } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

interface MarkdownRendererProps {
  content: string
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

// Helper function to process think tags
function processThinkTags(content: string) {
  const blocks = []
  let currentIndex = 0

  // Regular expressions to match both <Thinking> and <Thinking> tags (case-insensitive)
  // We'll use two separate regexes to ensure we capture the exact tag used
  const thinkingRegex = /<Thinking>([\s\S]*?)<\/Thinking>/gi
  const thinkRegex = /<Thinking>([\s\S]*?)<\/think>/gi

  // Combined regex that matches either tag pattern
  const combinedRegex = /<(Thinking|think)>([\s\S]*?)<\/\1>/gi

  let match
  while ((match = combinedRegex.exec(content)) !== null) {
    // Add text before the tag
    if (match.index > currentIndex) {
      blocks.push({
        type: "text",
        content: content.substring(currentIndex, match.index),
      })
    }

    // Add the think block (match[2] contains the content inside the tags)
    blocks.push({
      type: "think",
      content: match[2].trim(),
    })

    currentIndex = match.index + match[0].length
  }

  // Add any remaining text after the last tag
  if (currentIndex < content.length) {
    blocks.push({
      type: "text",
      content: content.substring(currentIndex),
    })
  }

  // If no tags were found, return the original content
  if (blocks.length === 0) {
    blocks.push({
      type: "text",
      content: content,
    })
  }

  return blocks
}

// Memoized markdown components
const MarkdownComponents = {
  code: memo(({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "")
    return !inline ? (
      <div className="relative">
        <pre className="rounded-md bg-muted p-4 overflow-x-auto">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
        {match && (
          <div className="absolute top-2 right-2 text-xs text-muted-foreground px-2 py-1 rounded bg-background/80">
            {match[1]}
          </div>
        )}
      </div>
    ) : (
      <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
        {children}
      </code>
    )
  }),
  table: memo(({ node, ...props }: any) => (
    <div className="overflow-x-auto">
      <table className="border-collapse border border-border w-full" {...props} />
    </div>
  )),
  thead: memo(({ node, ...props }: any) => <thead className="bg-muted" {...props} />),
  th: memo(({ node, ...props }: any) => <th className="border border-border p-2 text-left" {...props} />),
  td: memo(({ node, ...props }: any) => <td className="border border-border p-2" {...props} />),
  h1: memo(({ node, ...props }: any) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />),
  h2: memo(({ node, ...props }: any) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />),
  h3: memo(({ node, ...props }: any) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />),
  p: memo(({ node, ...props }: any) => <p className="mb-4" {...props} />),
  ul: memo(({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4" {...props} />),
  ol: memo(({ node, ...props }: any) => <ol className="list-decimal pl-6 mb-4" {...props} />),
  li: memo(({ node, ...props }: any) => <li className="mb-1" {...props} />),
  blockquote: memo(({ node, ...props }: any) => (
    <blockquote className="border-l-4 border-muted-foreground pl-4 italic my-4" {...props} />
  )),
}

// Main component
export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Memoize the processed content to avoid recalculating on every render
  const processedContent = useMemo(() => processThinkTags(content), [content])

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {processedContent.map((block, index) =>
        block.type === "think" ? (
          <ThinkBlock key={index} content={block.content} />
        ) : (
          <ReactMarkdown
            key={index}
            className="prose prose-sm dark:prose-invert max-w-none"
            components={MarkdownComponents}
          >
            {block.content}
          </ReactMarkdown>
        ),
      )}
    </div>
  )
}
