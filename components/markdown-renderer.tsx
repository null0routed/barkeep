"use client"

import ReactMarkdown from "react-markdown"

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
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
      {content}
    </ReactMarkdown>
  )
}
