import type { CampaignCheckpoint } from "./types"

/**
 * Campaign status checkpoints: persistence, validation, formatting, and the AI tool
 * definitions/handler. Checkpoints are stored in the browser's localStorage under the same
 * "dnd-*" key convention the rest of the app uses.
 */

export const CHECKPOINTS_STORAGE_KEY = "dnd-campaign-checkpoints"

export const SAVE_CHECKPOINT_TOOL_NAME = "saveCampaignCheckpoint"
export const GET_CHECKPOINTS_TOOL_NAME = "getCampaignCheckpoints"

const DEFAULT_CHECKPOINTS_RETURNED = 3
const MAX_CHECKPOINTS_RETURNED = 10
const MAX_INDEX_ENTRIES = 20

const OPTIONAL_TEXT_FIELDS = ["currentLocation", "activeQuests", "plotPoints", "npcs", "notes"] as const

const OPTIONAL_FIELD_LABELS: Record<(typeof OPTIONAL_TEXT_FIELDS)[number], string> = {
  currentLocation: "Location",
  activeQuests: "Active quests",
  plotPoints: "Plot points",
  npcs: "NPCs",
  notes: "Notes",
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI-compatible function-calling schema)
// ---------------------------------------------------------------------------

export const saveCampaignCheckpointTool = {
  type: "function",
  function: {
    name: SAVE_CHECKPOINT_TOOL_NAME,
    description:
      "Save a checkpoint of the current campaign status so it can be recalled in later sessions. " +
      "Each call adds a new checkpoint; earlier checkpoints are never overwritten.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short label for this checkpoint, e.g. 'Arrival in Waterdeep'." },
        summary: {
          type: "string",
          description: "Concise summary of what has happened and where the story stands right now.",
        },
        currentLocation: { type: "string", description: "Where the player character currently is." },
        activeQuests: { type: "string", description: "Open quests, goals, or objectives and their progress." },
        plotPoints: { type: "string", description: "Important story events, revelations, or decisions so far." },
        npcs: { type: "string", description: "Key NPCs, their attitudes toward the player, and their status." },
        notes: {
          type: "string",
          description: "Anything else worth remembering: house rules, promises made, unresolved threads, etc.",
        },
      },
      required: ["title", "summary"],
    },
  },
}

export const getCampaignCheckpointsTool = {
  type: "function",
  function: {
    name: GET_CHECKPOINTS_TOOL_NAME,
    description:
      "Retrieve saved campaign status checkpoints, newest first. By default returns the most recent few. " +
      "Pass an id to fetch one specific checkpoint.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: `How many of the newest checkpoints to return (default ${DEFAULT_CHECKPOINTS_RETURNED}, max ${MAX_CHECKPOINTS_RETURNED}).`,
        },
        id: { type: "string", description: "Fetch the single checkpoint with this id instead of the newest ones." },
      },
      required: [],
    },
  },
}

export const campaignCheckpointTools = [saveCampaignCheckpointTool, getCampaignCheckpointsTool]

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Validates untrusted data (localStorage contents or an imported file) into a clean checkpoint list.
 * Entries without a title and summary are dropped; missing ids/timestamps are filled in.
 */
export function sanitizeCheckpoints(raw: unknown): CampaignCheckpoint[] {
  if (!Array.isArray(raw)) return []

  const seenIds = new Set<string>()
  const result: CampaignCheckpoint[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const record = entry as Record<string, unknown>

    const title = asTrimmedString(record.title)
    const summary = asTrimmedString(record.summary)
    if (!title || !summary) continue

    let id = asTrimmedString(record.id) ?? generateId()
    if (seenIds.has(id)) id = generateId()
    seenIds.add(id)

    const checkpoint: CampaignCheckpoint = {
      id,
      createdAt: asTrimmedString(record.createdAt) ?? new Date().toISOString(),
      title,
      summary,
    }
    for (const field of OPTIONAL_TEXT_FIELDS) {
      const value = asTrimmedString(record[field])
      if (value) checkpoint[field] = value
    }
    result.push(checkpoint)
  }

  return result
}

export function loadCheckpoints(): CampaignCheckpoint[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CHECKPOINTS_STORAGE_KEY)
    return raw ? sanitizeCheckpoints(JSON.parse(raw)) : []
  } catch (error) {
    console.error("Error loading campaign checkpoints:", error)
    return []
  }
}

export interface SaveCheckpointsResult {
  ok: boolean
  /** Set when ok is false */
  error?: string
}

export function saveCheckpoints(checkpoints: CampaignCheckpoint[]): SaveCheckpointsResult {
  try {
    window.localStorage.setItem(CHECKPOINTS_STORAGE_KEY, JSON.stringify(checkpoints))
    return { ok: true }
  } catch (error) {
    // Typically QuotaExceededError, or storage disabled (e.g. some private-browsing modes)
    console.error("Error saving campaign checkpoints:", error)
    return { ok: false, error: error instanceof Error ? error.message : "Unknown storage error" }
  }
}

// ---------------------------------------------------------------------------
// Formatting (what the AI sees)
// ---------------------------------------------------------------------------

export function formatCheckpoint(checkpoint: CampaignCheckpoint): string {
  const lines = [`CHECKPOINT: ${checkpoint.title} [id: ${checkpoint.id}] (saved ${checkpoint.createdAt})`]
  lines.push(`Summary: ${checkpoint.summary}`)
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = checkpoint[field]
    if (value) lines.push(`${OPTIONAL_FIELD_LABELS[field]}: ${value}`)
  }
  return lines.join("\n")
}

export function formatCheckpoints(checkpoints: CampaignCheckpoint[], limit: number = DEFAULT_CHECKPOINTS_RETURNED): string {
  if (checkpoints.length === 0) {
    return "No campaign checkpoints have been saved yet."
  }

  const newestFirst = [...checkpoints].reverse()
  const shown = newestFirst.slice(0, limit)
  const rest = newestFirst.slice(limit)

  const parts = [
    `Showing ${shown.length} of ${checkpoints.length} saved checkpoints (newest first).`,
    ...shown.map(formatCheckpoint),
  ]

  if (rest.length > 0) {
    const index = rest.slice(0, MAX_INDEX_ENTRIES).map((c) => `- ${c.title} [id: ${c.id}] (saved ${c.createdAt})`)
    const more = rest.length > MAX_INDEX_ENTRIES ? `\n(+${rest.length - MAX_INDEX_ENTRIES} older not listed)` : ""
    parts.push(`OLDER CHECKPOINTS (fetch one by id):\n${index.join("\n")}${more}`)
  }

  return parts.join("\n\n")
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export interface CheckpointToolResult {
  /** Text returned to the AI as the tool result */
  content: string
  /** The checkpoint list after the call; the same array instance when nothing changed */
  checkpoints: CampaignCheckpoint[]
}

function parseToolArguments(rawArguments: unknown): Record<string, unknown> | null {
  if (rawArguments === undefined || rawArguments === null || rawArguments === "") return {}
  if (typeof rawArguments === "object") return rawArguments as Record<string, unknown>
  if (typeof rawArguments !== "string") return null
  try {
    const parsed = JSON.parse(rawArguments)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * Executes one checkpoint tool call. Returns null when the tool name isn't one of ours, so the
 * caller can fall through to other tools. For saves, the list is only updated if the write to
 * localStorage succeeded, which keeps in-memory state and persisted state in agreement.
 */
export function runCheckpointTool(
  name: string,
  rawArguments: unknown,
  current: CampaignCheckpoint[],
): CheckpointToolResult | null {
  if (name !== SAVE_CHECKPOINT_TOOL_NAME && name !== GET_CHECKPOINTS_TOOL_NAME) return null

  const args = parseToolArguments(rawArguments)
  if (!args) {
    return { content: "Error: tool arguments were not valid JSON. Nothing was changed.", checkpoints: current }
  }

  if (name === SAVE_CHECKPOINT_TOOL_NAME) {
    const title = asTrimmedString(args.title)
    const summary = asTrimmedString(args.summary)
    if (!title || !summary) {
      return { content: "Error: both 'title' and 'summary' are required. Nothing was saved.", checkpoints: current }
    }

    const checkpoint: CampaignCheckpoint = { id: generateId(), createdAt: new Date().toISOString(), title, summary }
    for (const field of OPTIONAL_TEXT_FIELDS) {
      const value = asTrimmedString(args[field])
      if (value) checkpoint[field] = value
    }

    const next = [...current, checkpoint]
    const result = saveCheckpoints(next)
    if (!result.ok) {
      return {
        content: `Error: the checkpoint could not be saved to browser storage (${result.error ?? "unknown error"}). Nothing was saved.`,
        checkpoints: current,
      }
    }
    return {
      content: `Checkpoint saved: "${title}" [id: ${checkpoint.id}]. Total checkpoints: ${next.length}.`,
      checkpoints: next,
    }
  }

  // GET_CHECKPOINTS_TOOL_NAME
  const requestedId = asTrimmedString(args.id)
  if (requestedId) {
    const match = current.find((c) => c.id === requestedId)
    return {
      content: match
        ? formatCheckpoint(match)
        : `No checkpoint found with id "${requestedId}".\n\n${formatCheckpoints(current, MAX_CHECKPOINTS_RETURNED)}`,
      checkpoints: current,
    }
  }

  const requestedLimit = Number(args.limit)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_CHECKPOINTS_RETURNED, Math.max(1, Math.floor(requestedLimit)))
    : DEFAULT_CHECKPOINTS_RETURNED

  return { content: formatCheckpoints(current, limit), checkpoints: current }
}
