"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Process the content to handle <Thinking> and <Thinking> tags
  const processedContent = processThinkTags(content)

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {processedContent.map((block, index) =>
        block.type === "think" ? (
          <ThinkBlock key={index} content={block.content} />
        ) : (
          <ReactMarkdown
            key={index}
            className="prose prose-sm dark:prose-invert max-w-none"
            components={{
              code({ node, inline, className, children, ...props }) {
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
              },
              // Override table styles for better dark mode compatibility
              table({ node, ...props }) {
                return (
                  <div className="overflow-x-auto">
                    <table className="border-collapse border border-border w-full" {...props} />
                  </div>
                )
              },
              thead({ node, ...props }) {
                return <thead className="bg-muted" {...props} />
              },
              th({ node, ...props }) {
                return <th className="border border-border p-2 text-left" {...props} />
              },
              td({ node, ...props }) {
                return <td className="border border-border p-2" {...props} />
              },
              // Add styling for other markdown elements
              h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
              h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
              h3: ({ node, ...props }) => <h3 className="text-lg font-bold mt-4 mb-2" {...props} />,
              p: ({ node, ...props }) => <p className="mb-4" {...props} />,
              ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-4" {...props} />,
              ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-4" {...props} />,
              li: ({ node, ...props }) => <li className="mb-1" {...props} />,
              blockquote: ({ node, ...props }) => (
                <blockquote className="border-l-4 border-muted-foreground pl-4 italic my-4" {...props} />
              ),
            }}
          >
            {block.content}
          </ReactMarkdown>
        ),
      )}
    </div>
  )
}

// Component for collapsible think blocks
function ThinkBlock({ content }: { content: string }) {
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
}

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
