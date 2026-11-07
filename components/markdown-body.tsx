"use client"

import { memo } from "react"
import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

/**
 * Shared markdown body (component map + prose wrapper).
 *
 * MarkdownRenderer (DM Chat) uses it for each processed content block, and the
 * character-sheet tabs use it for item description text (TODO.MD #13) so one
 * battle-tested map styles all markdown in the app. `compact` tightens block
 * margins for the tight tab rows, where the chat's airy `mb-4` paragraphs would
 * dominate the entry, and lets the text adopt the row's existing color context.
 */

// Memoized markdown components — the chat (non-compact) variant
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
  // App-chrome headings render in the Cinzel display face (globals.css base); markdown
  // bodies stay in the body face — opt out of the global rule explicitly.
  h1: memo(({ node, ...props }: any) => (
    <h1 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-2xl font-bold mt-6 mb-4" {...props} />
  )),
  h2: memo(({ node, ...props }: any) => (
    <h2 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-xl font-bold mt-5 mb-3" {...props} />
  )),
  h3: memo(({ node, ...props }: any) => (
    <h3 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-lg font-bold mt-4 mb-2" {...props} />
  )),
  p: memo(({ node, ...props }: any) => <p className="mb-4" {...props} />),
  ul: memo(({ node, ...props }: any) => <ul className="list-disc pl-6 mb-4" {...props} />),
  ol: memo(({ node, ...props }: any) => <ol className="list-decimal pl-6 mb-4" {...props} />),
  li: memo(({ node, ...props }: any) => <li className="mb-1" {...props} />),
  blockquote: memo(({ node, ...props }: any) => (
    <blockquote className="border-l-4 border-muted-foreground pl-4 italic my-4" {...props} />
  )),
}

// Memoized markdown components — the compact variant for the tight character-tab rows
const CompactMarkdownComponents = {
  code: memo(({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "")
    return !inline ? (
      <div className="relative">
        <pre className="rounded-md bg-muted p-3 overflow-x-auto text-xs">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
        {match && (
          <div className="absolute top-1.5 right-1.5 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-background/80">
            {match[1]}
          </div>
        )}
      </div>
    ) : (
      <code className="bg-muted px-1 py-0.5 rounded text-xs" {...props}>
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
  h1: memo(({ node, ...props }: any) => (
    <h1 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-lg font-bold mt-3 mb-1.5" {...props} />
  )),
  h2: memo(({ node, ...props }: any) => (
    <h2 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-base font-bold mt-2.5 mb-1" {...props} />
  )),
  h3: memo(({ node, ...props }: any) => (
    <h3 style={{ fontFamily: "var(--font-inter, ui-sans-serif, sans-serif)" }} className="text-sm font-bold mt-2 mb-1" {...props} />
  )),
  p: memo(({ node, ...props }: any) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />),
  ul: memo(({ node, ...props }: any) => <ul className="my-1.5 list-disc pl-5 last:mb-0" {...props} />),
  ol: memo(({ node, ...props }: any) => <ol className="my-1.5 list-decimal pl-5 last:mb-0" {...props} />),
  li: memo(({ node, ...props }: any) => <li className="my-0.5" {...props} />),
  blockquote: memo(({ node, ...props }: any) => (
    <blockquote className="my-1.5 border-l-4 border-muted-foreground pl-3 italic last:mb-0" {...props} />
  )),
}

// React DevTools names for the memoized components (same pattern as markdown-renderer.tsx)
MarkdownComponents.code.displayName = "MarkdownCode"
MarkdownComponents.table.displayName = "MarkdownTable"
MarkdownComponents.thead.displayName = "MarkdownThead"
MarkdownComponents.th.displayName = "MarkdownTh"
MarkdownComponents.td.displayName = "MarkdownTd"
MarkdownComponents.h1.displayName = "MarkdownH1"
MarkdownComponents.h2.displayName = "MarkdownH2"
MarkdownComponents.h3.displayName = "MarkdownH3"
MarkdownComponents.p.displayName = "MarkdownP"
MarkdownComponents.ul.displayName = "MarkdownUl"
MarkdownComponents.ol.displayName = "MarkdownOl"
MarkdownComponents.li.displayName = "MarkdownLi"
MarkdownComponents.blockquote.displayName = "MarkdownBlockquote"

CompactMarkdownComponents.code.displayName = "CompactMarkdownCode"
CompactMarkdownComponents.table.displayName = "CompactMarkdownTable"
CompactMarkdownComponents.thead.displayName = "CompactMarkdownThead"
CompactMarkdownComponents.th.displayName = "CompactMarkdownTh"
CompactMarkdownComponents.td.displayName = "CompactMarkdownTd"
CompactMarkdownComponents.h1.displayName = "CompactMarkdownH1"
CompactMarkdownComponents.h2.displayName = "CompactMarkdownH2"
CompactMarkdownComponents.h3.displayName = "CompactMarkdownH3"
CompactMarkdownComponents.p.displayName = "CompactMarkdownP"
CompactMarkdownComponents.ul.displayName = "CompactMarkdownUl"
CompactMarkdownComponents.ol.displayName = "CompactMarkdownOl"
CompactMarkdownComponents.li.displayName = "CompactMarkdownLi"
CompactMarkdownComponents.blockquote.displayName = "CompactMarkdownBlockquote"

interface MarkdownBodyProps {
  content: string
  // Tighter block spacing for the character-sheet tab rows (TODO.MD #13), and a
  // body color inherited from the row instead of prose's own contrast, so the
  // change alters rendering, not the look.
  compact?: boolean
}

export default function MarkdownBody({ content, compact = false }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        compact && "[--tw-prose-body:inherit]",
      )}
    >
      <ReactMarkdown components={compact ? CompactMarkdownComponents : MarkdownComponents}>{content}</ReactMarkdown>
    </div>
  )
}
