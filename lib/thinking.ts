/** A segment of a model reply: plain markdown text, or model thinking (TODO.MD #3.5). */
export interface ThoughtBlock {
  type: "text" | "think"
  content: string
}

// Both spellings of the inline thinking tag (the short and long form), case-insensitive.
// The pattern is built with concatenation so the two-character tag delimiters are never
// written as one literal in the source.
const THINK_TAG = "(?:thinking|think)"
const THINK_TAG_RE = new RegExp(
  "<" + THINK_TAG + ">" + "([\\s\\S]*?)" + "</" + THINK_TAG + ">",
  "gi",
)

/**
 * Split a model reply into text and thinking segments for inline thinking tags
 * (TODO.MD #3.5). Thinking renders in a collapsed block; a reply without any tags
 * comes back as a single text block so callers render nothing extra.
 */
export function splitThinkBlocks(content: string): ThoughtBlock[] {
  const blocks: ThoughtBlock[] = []
  let cursor = 0

  THINK_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = THINK_TAG_RE.exec(content)) !== null) {
    if (match.index > cursor) {
      blocks.push({ type: "text", content: content.substring(cursor, match.index) })
    }
    blocks.push({ type: "think", content: (match[1] ?? "").trim() })
    cursor = match.index + match[0].length
  }

  if (cursor < content.length) {
    blocks.push({ type: "text", content: content.substring(cursor) })
  }

  if (blocks.length === 0) {
    blocks.push({ type: "text", content })
  }

  return blocks
}
