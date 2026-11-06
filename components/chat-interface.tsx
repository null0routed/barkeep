"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback, memo } from "react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { ChatMessage, CampaignCheckpoint, CharacterData, CampaignNotes } from "@/lib/types"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  PencilIcon,
  SendIcon,
  SettingsIcon,
  SquareIcon,
  TrashIcon,
  RefreshCwIcon,
} from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import MarkdownRenderer from "./markdown-renderer"
import MessageImageRender from "./message-image-render"
import { formatCharacterData } from "@/lib/format-character-data"
import { campaignCheckpointTools, runCheckpointTool, formatCheckpoint } from "@/lib/campaign-checkpoints"
import { buildSystemMessageBase } from "@/lib/system-prompt"
import { collectLoot } from "@/lib/loot"
import type { LootEntry } from "@/lib/loot"
import { formatNotesForContext } from "@/lib/campaign-notes"
import {
  clampImageRate,
  MIN_IMAGE_RATE,
  MAX_IMAGE_RATE,
  imageTool,
  IMAGE_TOOL_NAME,
  generateImage,
  createImageRateLimiter,
  type ImageRateLimiter,
} from "@/lib/image-gen"
import { putImage, deleteImage, clearImages, imageStoreFootprint } from "@/lib/image-store"
import { formatBytes } from "@/lib/storage-budget"
import {
  buildStats,
  extractThinking,
  isAbortError,
  mergeUsage,
  readErrorDetail,
  statsLines,
  type ApiUsage,
  type AssistantTurn,
} from "@/lib/chat-turn"
import {
  accumulateToolCalls,
  finalizeToolCalls,
  iterateStream,
  parseToolArgs,
  type ToolCallAcc,
} from "@/lib/stream"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"

interface ChatInterfaceProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  apiUrl: string
  setApiUrl: React.Dispatch<React.SetStateAction<string>>
  apiKey: string
  setApiKey: React.Dispatch<React.SetStateAction<string>>
  model: string
  setModel: React.Dispatch<React.SetStateAction<string>>
  // Image generation (TODO #9) — optional; blank api-url disables the feature.
  imageApiUrl: string
  setImageApiUrl: React.Dispatch<React.SetStateAction<string>>
  // Optional dedicated key for the image endpoint; blank = reuse the chat API key.
  imageApiKey: string
  setImageApiKey: React.Dispatch<React.SetStateAction<string>>
  imageModel: string
  setImageModel: React.Dispatch<React.SetStateAction<string>>
  imageRate: number
  setImageRate: React.Dispatch<React.SetStateAction<number>>
  imageSize: string
  setImageSize: React.Dispatch<React.SetStateAction<string>>
  // Player-authored CUSTOM system prompt only. "" means "use the built-in DM prompt" —
  // the resolution to the actual model-facing prompt happens in callApi (TODO #7), and
  // the built-in text itself is never rendered in the settings dialog.
  systemPrompt: string
  setSystemPrompt: React.Dispatch<React.SetStateAction<string>>
  // Player-authored campaign notes; shared with the AI only while notesInContext is opted in
  campaignNotes: CampaignNotes
  notesInContext: boolean
  campaignCheckpoints: CampaignCheckpoint[]
  setCampaignCheckpoints: React.Dispatch<React.SetStateAction<CampaignCheckpoint[]>>
  maxMessages: number
  setMaxMessages: React.Dispatch<React.SetStateAction<number>>
  /** Merge loot finds captured out of assistant messages into the page-level store (TODO #8, T8.1). */
  onLootCapture?: (entries: LootEntry[]) => void
  character: CharacterData
}

// Default number of previous messages included in the model context (also the shared
// initial state in app/page.tsx — was inconsistently 6 here vs 10 there)
export const DEFAULT_MAX_MESSAGES = 10

/**
 * T1.3: toast the real reason when the turn failed at the API itself (the error we
 * throw carries the provider's explanation, e.g. "API error: 401 — Invalid API key");
 * otherwise keep the generic actionable wording. Module-level so the turn callbacks
 * can use it without adding an unstable dep.
 */
function toastForTurnError(error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : ""
  toast.error(message.startsWith("API error") ? message : fallback)
}

// Static tool definition (module scope keeps its identity stable across renders —
// same pattern as campaignCheckpointTools in lib/campaign-checkpoints.ts)
const CHARACTER_SHEET_TOOL = {
  type: "function",
  function: {
    name: "getCharacterSheet",
    description: "Get the player's character sheet information",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
}

// One tool-result message handed back to the API (the shape the getCharacterSheet and
// checkpoint tools already build at their call sites).
type ToolResultMessage = {
  tool_call_id: string
  role: "tool"
  name: string
  content: string
}

// The outcome of executing a batch of tool calls (TODO.MD #9): the per-call results to
// feed the follow-up leg, plus the optional scene image to attach to the completed turn.
type ToolCallOutcome = {
  results: ToolResultMessage[]
  image?: { id: string; alt: string; src?: string }
}

// Memoized message component to prevent re-rendering all messages when typing
const ChatMessageComponent = memo(
  ({
    message,
    onDelete,
    onRegenerate,
    isRegenerating,
    onEdit,
    isEditing,
    editDraft,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
    inFlight,
  }: {
    message: ChatMessage
    onDelete: (id: string) => void
    onRegenerate?: (id: string) => void
    isRegenerating?: boolean
    // TODO.MD #3.2 (edit)
    onEdit?: (id: string) => void
    isEditing?: boolean
    editDraft?: string
    onEditDraftChange?: (value: string) => void
    onSaveEdit?: (id: string) => void
    onCancelEdit?: () => void
    // True while any turn is running or a message is in inline edit
    inFlight?: boolean
  }) => {
    const isUser = message.role === "user"

    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`flex items-start gap-1 group ${
            isUser ? "flex-row-reverse" : "flex-row"
          }${isUser && isEditing ? " w-full" : ""}`}
        >
          {/*
            Message action toolbar (TODO.MD #3.1): sits NEXT TO the bubble
            (user's right, assistant's left) and fades in on hover or keyboard
            focus — never overlaid on the message text. The space is always
            reserved (opacity only), so hover never reflows the list. On
            touch/small screens controls stay visible since hover doesn't exist.
          */}
          <div
            role="group"
            aria-label="Message actions"
            className="flex shrink-0 flex-col gap-1 pt-1 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            {/* TODO.MD #3.2: edit + resend, on user bubbles only */}
            {/* TODO.MD #3.4: per-turn stats (tokens in/out, context, speed, duration) */}
            {!isUser && message.stats && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-muted"
                    title="Turn statistics"
                    aria-label="Turn statistics"
                  >
                    <InfoIcon className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="grid grid-cols-[max-content_max-content] gap-x-3 gap-y-0.5">
                    {statsLines(message.stats).map((line) => (
                      <span key={line.label} className="contents">
                        <span className="pr-1 opacity-60">{line.label}</span>
                        <span className="whitespace-nowrap">{line.value}</span>
                      </span>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
            {isUser && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onClick={() => onEdit(message.id)}
                disabled={inFlight}
                title="Edit and resend chat"
                aria-label="Edit message"
              >
                <PencilIcon className="h-3 w-3" />
              </Button>
            )}
            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-muted"
                onClick={() => onRegenerate(message.id)}
                disabled={isRegenerating || inFlight}
                title="Regenerate response"
                aria-label="Regenerate response"
              >
                <RefreshCwIcon className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(message.id)}
              title="Delete message"
              aria-label="Delete message"
            >
              <TrashIcon className="h-3 w-3" />
            </Button>
          </div>

          <div
            className={`max-w-[85%] max-w-3xl rounded-lg p-3 text-sm ${
              isUser
                ? isEditing
                  ? // T5-E6: in edit mode the bubble is a full-width editor
                  // (w-full on this div AND its row above) — without an explicit
                  // width it sizes to content (the textarea's ~20ch intrinsic
                  // width), which reads as a slim ~200px box.
                  "w-full bg-background"
                  : "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}
          >
            {isUser && isEditing ? (
              // TODO.MD #3.2: edit the message, then Save re-submits the whole chat
              <div className="w-full space-y-2">
                <Textarea
                  value={editDraft}
                  onChange={(e) => onEditDraftChange?.(e.target.value)}
                  rows={Math.max(2, Math.min(8, (editDraft ?? "").split("\n").length))}
                  className="min-h-[48px] resize-y text-sm"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" className="h-7" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7"
                    onClick={() => onSaveEdit?.(message.id)}
                    disabled={!editDraft || !editDraft.trim()}
                  >
                    Save &amp; resend
                  </Button>
                </div>
              </div>
            ) : isUser ? (
              message.content
            ) : (
              <>
                {/* Scene image (TODO.MD #9.2): centered at the top of the bubble, above
                    the narration. Renders a 720p thumbnail + full-size lightbox. */}
                {message.image && (
                  <div className="mb-2">
                    <MessageImageRender id={message.image.id} alt={message.image.alt} />
                  </div>
                )}
                <MarkdownRenderer content={message.content} thinking={message.thinking} />
              </>
            )}
          </div>
        </div>
      </div>
    )
  },
)

ChatMessageComponent.displayName = "ChatMessage"

// Memoized message list component
const MessageList = memo(
  ({
    messages,
    showThinking,
    messagesEndRef,
    onDeleteMessage,
    onRegenerateMessage,
    regeneratingId,
    onEdit,
    editingId,
    editDraft,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
    inFlight,
  }: {
    messages: ChatMessage[]
    showThinking: boolean
    messagesEndRef: React.RefObject<HTMLDivElement | null>
    onDeleteMessage: (id: string) => void
    onRegenerateMessage: (id: string) => void
    regeneratingId: string | null
    onEdit: (id: string) => void
    editingId: string | null
    editDraft: string
    onEditDraftChange: (value: string) => void
    onSaveEdit: (id: string) => void
    onCancelEdit: () => void
    inFlight: boolean
  }) => {
    return (
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No messages yet. Start a conversation with your AI assistant!
          </div>
        ) : (
          messages.map((message) => {
            // T1.1: each bubble must keep STABLE props when it is not the edit target,
            // or its memo() is defeated — and every keystroke in the inline editor
            // (whose onChange recreates `saveEdit` and mutates `editDraft`) would
            // re-render and re-parse the markdown of the ENTIRE history. Scope the
            // edit state to the edited bubble only; everyone else gets stable undefined.
            const isEditTarget = editingId === message.id
            return (
              <ChatMessageComponent
                key={message.id}
                message={message}
                onDelete={onDeleteMessage}
                onRegenerate={message.role === "assistant" ? onRegenerateMessage : undefined}
                isRegenerating={regeneratingId === message.id}
                onEdit={message.role === "user" ? onEdit : undefined}
                isEditing={isEditTarget}
                editDraft={isEditTarget ? editDraft : undefined}
                onEditDraftChange={isEditTarget ? onEditDraftChange : undefined}
                onSaveEdit={isEditTarget ? onSaveEdit : undefined}
                onCancelEdit={isEditTarget ? onCancelEdit : undefined}
                inFlight={inFlight}
              />
            )
          })
        )}
        {showThinking && (
          <div className="flex justify-start">
            <div className="max-w-[85%] max-w-3xl rounded-lg p-3 bg-muted animate-pulse text-sm">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    )
  },
)

MessageList.displayName = "MessageList"

export default function ChatInterface({
  messages,
  setMessages,
  apiUrl,
  setApiUrl,
  apiKey,
  setApiKey,
  model,
  setModel,
  imageApiUrl,
  setImageApiUrl,
  imageApiKey,
  setImageApiKey,
  imageModel,
  setImageModel,
  imageRate,
  setImageRate,
  imageSize,
  setImageSize,
  systemPrompt,
  setSystemPrompt,
  campaignNotes,
  notesInContext,
  campaignCheckpoints,
  setCampaignCheckpoints,
  maxMessages,
  setMaxMessages,
  onLootCapture,
  character,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // T1.2: true once the current turn has produced visible content. The "Thinking…"
  // placeholder then only shows while the turn is still silent (pre-LLM latency, the
  // tool round-trip, image generation) — never below a bubble that is already typing.
  const [turnHasContent, setTurnHasContent] = useState(false)
  const [chatHeight, setChatHeight] = useState(600)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  // Settings dialog: the image-generation block is an expandable section that starts
  // collapsed (owner 2026-11-05) so the dialog stays focused on the chat settings.
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false)
  // T1.4: stored scene-image footprint (count + bytes), loaded when the dialog opens —
  // the per-image 4 MB cap exists but the TOTAL was otherwise invisible.
  const [imageFootprint, setImageFootprint] = useState<{ count: number; bytes: number } | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  // TODO.MD #3.2: the user message currently in inline edit, and its draft text
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chatContentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Loot capture (TODO #8, T8.1): pull barkeep-loot fences out of assistant messages
  // and hand them to the page-level store (state lives in app/page.tsx). Processing
  // is keyed on id + content length so a fence that arrives incomplete mid-stream is
  // re-parsed as the message grows; mergeLoot dedupes any double delivery
  // (StrictMode, edited messages). On first load / import the same effect
  // re-captures from existing history — the store self-heals, no migration needed.
  const lootSeenRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!onLootCapture) return
    for (const message of messages) {
      if (message.role !== "assistant" || !message.content) continue
      const key = message.id + "@" + message.content.length
      if (lootSeenRef.current.has(key)) continue
      lootSeenRef.current.add(key)
      const found = collectLoot(message.content)
      if (found.length > 0) onLootCapture(found)
    }
  }, [messages, onLootCapture])

  // TODO.MD #3.3: one AbortController per in-flight turn; created by the turn handlers
  // before the request, and read by the leg fetches as their `signal`.
  const abortRef = useRef<AbortController | null>(null)

  // Mirror of the checkpoint list so tool calls always see the latest value, even when several
  // tool calls run before React re-renders (a plain closure over the prop would be stale)
  const checkpointsRef = useRef<CampaignCheckpoint[]>(campaignCheckpoints)
  useEffect(() => {
    checkpointsRef.current = campaignCheckpoints
  }, [campaignCheckpoints])

  // Total message count, mirrored so the image rate limiter (which keys on the running
  // conversation length, not the trimmed window passed to callApi) sees the live value.
  const messagesCountRef = useRef(messages.length)
  useEffect(() => {
    messagesCountRef.current = messages.length
  }, [messages])

  // Image rate limiter (TODO.MD #9.3, owner D3): allows one generated image per
  // imageRate messages. Recreated when the setting changes so the new window applies
  // immediately (and a deliberate reset is allowed); in-memory only — a reload starts
  // a fresh window, by design.
  const imageRateLimiterRef = useRef(createImageRateLimiter(imageRate))
  useEffect(() => {
    imageRateLimiterRef.current = createImageRateLimiter(imageRate)
  }, [imageRate])

  // T1.4: refresh the stored scene footprint on each dialog open (one cheap IDB read;
  // resolves a clean result even where IndexedDB is unavailable).
  const refreshImageFootprint = useCallback(async () => {
    const result = await imageStoreFootprint()
    setImageFootprint(result.ok && result.value ? result.value : null)
  }, [])

  // Calculate and set the chat height based on window size
  const updateChatHeight = useCallback(() => {
    if (containerRef.current) {
      const windowHeight = window.innerHeight
      const containerRect = containerRef.current.getBoundingClientRect()
      const containerTop = containerRect.top
      const headerHeight = 40 // Approximate height of the chat header
      const padding = 24 // Some padding

      // The composer footer is auto-height (T2.1 multiline input) and sits INSIDE the
      // card's fixed height, so it no longer needs its own subtraction here.
      const newHeight = windowHeight - containerTop - headerHeight - padding
      setChatHeight(Math.max(400, newHeight)) // Minimum height of 400px
    }
  }, [])

  // Update height on mount and window resize
  useEffect(() => {
    updateChatHeight()
    window.addEventListener("resize", updateChatHeight)
    return () => window.removeEventListener("resize", updateChatHeight)
  }, [updateChatHeight])

  const scrollToBottom = useCallback(() => {
    if (chatContentRef.current) {
      chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Function to handle tool calls (character sheet + campaign checkpoints + scene image).
  // Async because the generateImage tool performs a network call and an IndexedDB write
  // (TODO.MD #9.2). Returns the per-call results for the follow-up leg plus the optional
  // scene image to attach to the completed turn (at most one — the first that succeeds).
  const handleToolCalls = useCallback(
    async (toolCalls: any[]): Promise<ToolCallOutcome> => {
      const results: ToolResultMessage[] = []
      let image: ToolCallOutcome["image"]
      let workingCheckpoints = checkpointsRef.current

      for (const toolCall of toolCalls) {
        const toolName: string = toolCall.function.name

        if (toolName === "getCharacterSheet") {
          // Format the character data
          const formattedCharacterData = formatCharacterData(character)
          results.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: "getCharacterSheet",
            content: formattedCharacterData,
          })
          continue
        }

        // Scene image (TODO.MD #9.2): rate-limited, then generated and persisted to
        // IndexedDB. Any failure (rate limit, no IDB, over-cap, API error) degrades to a
        // "describe it in words" instruction so the turn always completes.
        if (toolName === IMAGE_TOOL_NAME) {
          const args = parseToolArgs(toolCall.function.arguments)
          const prompt = typeof args.prompt === "string" ? args.prompt.trim() : ""
          const alt = typeof args.alt === "string" && args.alt.trim() ? args.alt.trim() : prompt || "Generated scene"

          const messageCount = messagesCountRef.current
          if (!imageRateLimiterRef.current.can(messageCount)) {
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                "Image generation is rate-limited right now (too soon since the last image). " +
                "Do not request another; instead describe this scene, character, or moment in " +
                "vivid written narration and continue the story.",
            })
            continue
          }

          try {
            if (!prompt) {
              throw new Error("missing prompt")
            }
            const generated = await generateImage(
              {
                apiUrl: imageApiUrl,
                // A dedicated image key wins when set; otherwise fall back to the chat key
                // (most single-provider setups need only one key).
                apiKey: imageApiKey.trim() ? imageApiKey.trim() : apiKey || undefined,
                model: imageModel || undefined,
                size: imageSize,
                signal: abortRef.current?.signal,
              },
              prompt,
            )
            const id = crypto.randomUUID()
            const stored = await putImage({ id, alt, src: generated.src, mime: generated.mime })
            if (!stored.ok) {
              // Could not persist (no IDB, private browsing, or over the per-image cap):
              // ask the model to carry the scene in words instead of leaving an empty bubble.
              results.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: toolName,
                content:
                  `The generated image could not be stored (${stored.reason ?? "unknown reason"}). ` +
                  "Describe this scene in words instead and continue the story.",
              })
              continue
            }
            // Remember the image for the turn and record the rate-limit anchor.
            image = { id, alt, src: generated.src }
            imageRateLimiterRef.current.mark(messageCount)
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                `Scene image generated and shown to the player (alt: "${alt}"). ` +
                "The player can see it, so do not re-describe it in detail — continue the story.",
            })
          } catch (error) {
            // A user-initiated abort must surface as an error (the caller shows "Stopped.");
            // any other failure degrades to written narration.
            if (isAbortError(error)) throw error
            results.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: toolName,
              content:
                "Image generation failed this time. Describe this scene, character, or moment in " +
                "words and continue the story.",
            })
          }
          continue
        }

        // Checkpoint tools: saves persist to localStorage inside runCheckpointTool
        const checkpointResult = runCheckpointTool(toolName, toolCall.function.arguments, workingCheckpoints)
        if (checkpointResult) {
          workingCheckpoints = checkpointResult.checkpoints
          results.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: checkpointResult.content,
          })
          continue
        }

        // Every tool call needs a matching result or the API rejects the follow-up request
        results.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolName,
          content: `Error: unknown tool "${toolName}".`,
        })
      }

      if (workingCheckpoints !== checkpointsRef.current) {
        checkpointsRef.current = workingCheckpoints
        setCampaignCheckpoints(workingCheckpoints)
      }

      return { results, image }
    },
    [character, setCampaignCheckpoints, imageApiUrl, apiKey, imageApiKey, imageModel, imageSize],
  )

  // Run one turn against the OpenAI-compatible endpoint and normalize it into an
  // AssistantTurn (content + optional model thinking + request stats — TODO.MD #3.4/#3.5).
  // `conversation` is the full ordered history for the turn; `onDelta` is invoked with the
  // accumulated content each time more of it arrives.
  //
  // Streaming (TODO.MD #3.6): each leg is requested with `stream: true`. If the endpoint
  // answers with a `text/event-stream` body the SSE chunks are read (content streamed to
  // onDelta as it lands, thinking/usage accumulated, tool-call fragments assembled); if it
  // ignores `stream` and returns a single JSON document instead, that is read as the
  // fall-back body. Both paths converge on the same per-leg result, so the two-leg tool
  // flow below is identical either way.
  const callApi = useCallback(
    async (conversation: ChatMessage[], onDelta?: (content: string) => void): Promise<AssistantTurn> => {
      try {
        const startedAt = Date.now()
        // Prepare the system message with the header summary and tool instructions
        const toolInstructions = `
You have access to the player's character sheet through a tool. You can access it by calling the getCharacterSheet function.
Use this tool when you need to reference the character's stats, abilities, inventory, or other details.
DO NOT mention that you're using this tool to the player - just incorporate the information naturally in your responses.

You also have two tools for long-term campaign memory, because older chat messages eventually drop out of your context:
- saveCampaignCheckpoint: call it at natural stopping points, such as the end of a scene, arrival at a new location, a major decision or revelation, a quest starting or finishing, or when the player says they are wrapping up. Record where the story stands and what you would need to pick it back up later. Do not save a checkpoint after every message.
- getCampaignCheckpoints: call it when a conversation begins or resumes with little prior context, when the player asks for a recap or says they are continuing, or when you are unsure about earlier events.
DO NOT mention these tools to the player - use them quietly and just continue the story.
`

        // Scene image (TODO.MD #9): the generateImage tool and its guidance are only
        // advertised when the owner has configured an image endpoint — blank means the
        // feature is entirely off (no tool, no instruction, no cost).
        const imageEnabled = imageApiUrl.trim().length > 0
        const imageInstructions = imageEnabled
          ? `\nYou can depict major moments with the ${IMAGE_TOOL_NAME} tool. For a significant scene change, arriving in a new location, or the introduction of an important character, you MAY generate one image to set the scene. Use it sparingly — only for these major moments — because it is rate-limited; for everything else rely on your written narration. When the tool confirms the image was shown, trust that the player can see it: continue the story rather than re-describing it.
`
          : ""

        const systemMessage = {
          role: "system",
          // The custom prompt wins if set, otherwise the built-in DM prompt (TODO #7),
          // plus the loot-capture section appended to BOTH (TODO #8 — owner decision).
          content: `${buildSystemMessageBase(systemPrompt)}\n\n${
            notesInContext ? formatNotesForContext(campaignNotes) : ""
          }${
            campaignCheckpoints.length > 0
              ? `CAMPAIGN CONTEXT (from the latest saved checkpoint):\n${formatCheckpoint(campaignCheckpoints[campaignCheckpoints.length - 1])}\n\n`
              : ""
          }${toolInstructions}${imageInstructions}\nPlease keep this context in mind when responding.`,
        }

        // Prepare the messages for the API — `conversation` is the full ordered
        // history for this turn (the caller decides how far back it reaches)
        const apiMessages = [
          systemMessage,
          ...conversation.map((msg) => ({ role: msg.role, content: msg.content })),
        ]

        // One leg of the turn: POST (trying `stream: true`) and accumulate its answer —
        // text content (streamed to onDelta as it lands), thinking, usage, and any tool
        // calls — from an SSE body (preferred) or, as the fallback, a single JSON document.
        const runLeg = async (payload: Record<string, unknown>) => {
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            // TODO.MD #3.3: lets the Stop button cancel this leg mid-stream
            signal: abortRef.current?.signal,
          })

          if (!response.ok) {
            // T1.3: surface the provider's own explanation (bad key, context overflow,
            // unknown model, ...) — the status line alone leaves the user guessing.
            const detail = await readErrorDetail(response)
            throw new Error(detail ? `API error: ${response.status} — ${detail}` : `API error: ${response.status}`)
          }

          const contentType = response.headers.get("content-type") ?? ""
          const isSse = contentType.includes("text/event-stream")

          let content = ""
          let thinking = ""
          let usage: ApiUsage | undefined
          const toolAcc = new Map<number, ToolCallAcc>()

          // Fold provider thinking (whatever field it arrives in) into the running total.
          const takeThinking = (value: unknown): void => {
            const found = extractThinking(value)
            if (found) thinking += found
          }

          if (isSse && response.body) {
            for await (const chunk of iterateStream(response.body)) {
              if (typeof chunk !== "object" || chunk === null) continue
              const c = chunk as Record<string, unknown>
              if (c.usage && typeof c.usage === "object") {
                usage = mergeUsage(usage, c.usage as ApiUsage)
              }
              const choices = Array.isArray(c.choices) ? c.choices : []
              const first = choices[0]
              const delta =
                first && typeof first.delta === "object" && first.delta !== null
                  ? (first.delta as Record<string, unknown>)
                  : undefined
              if (!delta) continue
              if (typeof delta.content === "string") {
                content += delta.content
                onDelta?.(content)
              }
              takeThinking(delta)
              if (delta.tool_calls) {
                accumulateToolCalls(toolAcc, delta.tool_calls)
              }
            }
          } else {
            // Fall-back: the endpoint ignored `stream: true` and returned one JSON document.
            const data = (await response.json()) as Record<string, unknown>
            if (data.usage && typeof data.usage === "object") {
              usage = mergeUsage(usage, data.usage as ApiUsage)
            }
            const choices = Array.isArray(data.choices) ? data.choices : []
            const msg =
              choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : undefined
            const message =
              msg && typeof msg.message === "object" && msg.message !== null
                ? (msg.message as Record<string, unknown>)
                : undefined
            if (message) {
              if (typeof message.content === "string") content = message.content
              takeThinking(message)
              if (Array.isArray(message.tool_calls)) {
                ;(message.tool_calls as unknown[]).forEach((raw, index) => {
                  const call = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
                  const fn =
                    call.function && typeof call.function === "object"
                      ? (call.function as Record<string, unknown>)
                      : {}
                  toolAcc.set(index, {
                    id: typeof call.id === "string" ? call.id : "",
                    name: typeof fn.name === "string" ? fn.name : "",
                    arguments: typeof fn.arguments === "string" ? fn.arguments : "",
                  })
                })
              }
            }
            // Surface the already-complete content as a single delta so callers are uniform.
            if (content) onDelta?.(content)
          }

          return {
            content,
            thinking: thinking.trim() ? thinking : undefined,
            usage,
            toolCalls: finalizeToolCalls(toolAcc),
          }
        }

        // Leg one — the tool-enabled request. If it produced tool calls, run the follow-up
        // leg with the results; otherwise the first leg is the final answer.
        const leg1 = await runLeg({
          model: model,
          messages: apiMessages,
          tools: [CHARACTER_SHEET_TOOL, ...campaignCheckpointTools, ...(imageEnabled ? [imageTool] : [])],
          tool_choice: "auto",
          stream: true,
          stream_options: { include_usage: true },
        })

        if (leg1.toolCalls.length > 0) {
          // handleToolCalls is async (the generateImage tool performs a network call and an
          // IndexedDB write). It returns the per-call results for the follow-up leg plus the
          // optional scene image to attach to the completed turn.
          const { results: toolResults, image } = await handleToolCalls(leg1.toolCalls)
          const firstMessage = {
            role: "assistant",
            content: leg1.content || null,
            tool_calls: leg1.toolCalls,
          }
          const leg2 = await runLeg({
            model: model,
            messages: [...apiMessages, firstMessage, ...toolResults],
            stream: true,
            stream_options: { include_usage: true },
          })
          return {
            content: leg2.content,
            thinking: leg2.thinking,
            stats: buildStats(mergeUsage(leg1.usage, leg2.usage), startedAt, conversation.length),
            ...(image ? { image } : {}),
          }
        }

        return {
          content: leg1.content,
          thinking: leg1.thinking,
          stats: buildStats(leg1.usage, startedAt, conversation.length),
        }
      } catch (error) {
        console.error("Error calling API:", error)
        throw error
      }
    },
    [model, apiKey, apiUrl, imageApiUrl, systemPrompt, campaignNotes, notesInContext, campaignCheckpoints, handleToolCalls],
  )

  // Shared turn bookkeeping: creates the assistant bubble under a stable id up front
  // (so streaming deltas — TODO.MD #3.6 — and the final turn all land on the same
  // bubble), then settles it with the normalized turn content, thinking, and stats.
  // Pass an existing assistant bubble id (regenerate) to update it in place, or omit
  // the id (send/edit) to append a new bubble.
  const runAssistant = useCallback(
    async (conversation: ChatMessage[], bubbleId?: string) => {
      const id = bubbleId ?? crypto.randomUUID()
      setTurnHasContent(false)

      const upsertContent = (content: string) => {
        if (content) setTurnHasContent(true)
        setMessages((prev) => {
          const index = prev.findIndex((message) => message.id === id)
          if (index === -1) {
            return [...prev, { id, role: "assistant" as const, content }]
          }
          const next = [...prev]
          next[index] = { ...next[index], content }
          return next
        })
      }

      const turn = await callApi(conversation, upsertContent)

      setMessages((prev) => {
        const index = prev.findIndex((message) => message.id === id)
        const finalMessage: ChatMessage = {
          id,
          role: "assistant",
          content: turn.content,
          thinking: turn.thinking,
          stats: turn.stats,
          // Persist only the small IndexedDB reference (id + alt) — the image bytes live in
          // IndexedDB (lib/image-store.ts) and are fetched by the renderer on demand.
          // Undefined (a non-image turn) serializes to nothing, keeping the record tiny.
          image: turn.image ? { id: turn.image.id, alt: turn.image.alt } : undefined,
        }
        if (index === -1) {
          return [...prev, finalMessage]
        }
        const next = [...prev]
        next[index] = finalMessage
        return next
      })
    },
    [callApi, setMessages],
  )

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault()
      if (!input.trim()) return

      // Add user message
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: input,
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
      setIsLoading(true)

      try {
        // Get the most recent messages, limited by maxMessages
        const recentMessages = messages.slice(-maxMessages)
        console.log(
          `Using ${recentMessages.length} recent messages out of ${messages.length} total (limit: ${maxMessages})`,
        )

        abortRef.current = new AbortController()
        await runAssistant([...recentMessages, userMessage])
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error calling API:", error)
        // Ephemeral notification only — never persist error text into history, where it
        // would be replayed into model context on every subsequent request
        toastForTurnError(
          error,
          "Sorry, there was an error processing your request. Please check your API settings and try again.",
        )
      } finally {
        setIsLoading(false)
        // Focus the input field after sending a message
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }
    },
    [input, messages, maxMessages, setMessages, runAssistant],
  )

  const handleDeleteMessage = useCallback(
    (id: string) => {
      // Free the IndexedDB blob behind the deleted message (TODO.MD #9.2). deleteImage is
      // fire-and-forget and never throws, so a pending store write can't block the removal.
      const target = messages.find((msg) => msg.id === id)
      if (target?.image?.id) void deleteImage(target.image.id)

      setMessages((prev) => {
        // Find the index of the message to delete
        const index = prev.findIndex((msg) => msg.id === id)
        if (index === -1) return prev

        // Create a new array without the deleted message
        const newMessages = [...prev]
        newMessages.splice(index, 1)
        return newMessages
      })
    },
    [messages, setMessages],
  )

  const handleRegenerateMessage = useCallback(
    async (id: string) => {
      // Find the assistant message to regenerate
      const assistantIndex = messages.findIndex((msg) => msg.id === id)
      if (assistantIndex === -1 || messages[assistantIndex].role !== "assistant") return

      // Find the user message that prompted this response
      let userIndex = assistantIndex - 1
      while (userIndex >= 0) {
        if (messages[userIndex].role === "user") break
        userIndex--
      }

      if (userIndex < 0) return // No user message found

      const userMessage = messages[userIndex]
      setRegeneratingId(id)

      try {
        // Get context messages (messages before the user message), then re-run the turn
        // and update the existing assistant bubble in place (same id → no remount)
        const conversation = [...messages.slice(0, userIndex), userMessage]
        abortRef.current = new AbortController()
        await runAssistant(conversation, id)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error regenerating message:", error)
        toastForTurnError(error, "Sorry, the response could not be regenerated.")
      } finally {
        setRegeneratingId(null)
      }
    },
    [messages, runAssistant],
  )

  // TODO.MD #3.3: abort the in-flight turn. Whatever content already rendered stays;
  // the abort surfaces as a neutral "Stopped." toast in the caller's catch.
  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // True while any turn is running OR a message is in inline edit — gates the
  // per-bubble actions and the composer so turns and edits never interleave.
  const inFlight = isLoading || regeneratingId !== null || editingId !== null

  // TODO.MD #3.2 (edit): begin inline editing of a user message
  const startEdit = useCallback(
    (id: string) => {
      const target = messages.find((msg) => msg.id === id)
      if (!target || target.role !== "user") return
      setEditingId(id)
      setEditDraft(target.content)
    },
    [messages],
  )

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditDraft("")
  }, [])

  // TODO.MD #3.2 (edit): apply the draft in place, then re-submit the WHOLE chat —
  // the edited message stays in its position, the tail is preserved (PLAN.MD
  // decision #2) — and append the new assistant reply at the end.
  const saveEdit = useCallback(
    async (id: string) => {
      if (!editDraft.trim()) return
      const updated = messages.map((msg) => (msg.id === id ? { ...msg, content: editDraft } : msg))
      setMessages(updated)
      setEditingId(null)
      setEditDraft("")
      setIsLoading(true)

      try {
        abortRef.current = new AbortController()
        await runAssistant(updated)
      } catch (error) {
        if (isAbortError(error)) {
          toast.info("Stopped.")
          return
        }
        console.error("Error re-submitting chat after edit:", error)
        toastForTurnError(error, "Sorry, the edited chat could not be re-run.")
      } finally {
        setIsLoading(false)
      }
    },
    [messages, editDraft, runAssistant, setMessages],
  )

  const handleClearChat = useCallback(() => {
    // Free every stored scene image and reset the image rate limiter — the conversation is
    // gone, so the next message starts a fresh window (TODO.MD #9.2/#9.3).
    void clearImages()
    imageRateLimiterRef.current.reset()
    messagesCountRef.current = 0
    setMessages([])
    setIsAlertOpen(false)
  }, [setMessages])

  // Memoized input change handler to prevent re-renders (T2.1: the composer is a textarea now)
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  return (
    // Radix Tooltip requires a provider ancestor; scoping it here keeps the bubble
    // actions self-contained (settings, alerts, and dialogs do not need it)
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col h-full" ref={containerRef}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">AI Chat</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsAlertOpen(true)}
            disabled={messages.length === 0}
            className="hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Clear chat history"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
          <Dialog
            onOpenChange={(open) => {
              if (open) void refreshImageFootprint()
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" title="Chat settings">
                <SettingsIcon className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Chat Settings</DialogTitle>
                <DialogDescription>Configure your AI chat settings here.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="api-url">API URL</Label>
                  <Input
                    id="api-url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1/chat/completions"
                  />
                  <p className="text-xs text-muted-foreground">
                    For local models, use something like: http://localhost:1234/v1/chat/completions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key (required for most services)"
                  />
                  <p className="text-xs text-muted-foreground">
                    An API key is required for OpenAI services. Some local servers may not require a key.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Model name (e.g., gpt-3.5-turbo, llama3, etc.)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Common models: gpt-3.5-turbo, gpt-4, llama-3-8b-instruct, mistral-7b-instruct, etc.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-messages">Max Previous Messages</Label>
                  <Input
                    id="max-messages"
                    type="number"
                    value={maxMessages}
                    onChange={(e) =>
                      setMaxMessages(Math.max(1, Number.parseInt(e.target.value) || DEFAULT_MAX_MESSAGES))
                    }
                    min={1}
                    max={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of previous messages to include in the context (1-20).
                  </p>
                </div>
              </div>

              {/* Image generation (optional) — TODO.MD #9; expandable section, starts collapsed */}
              <div className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 p-3 text-left"
                  onClick={() => setImageSettingsOpen((open) => !open)}
                  aria-expanded={imageSettingsOpen}
                >
                  {imageSettingsOpen ? (
                    <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">Image generation (optional)</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
                      imageApiUrl.trim()
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {imageApiUrl.trim() ? "On" : "Off"}
                  </span>
                </button>
                {imageSettingsOpen && (
                  <div className="space-y-3 border-t p-3">
                    <p className="text-xs text-muted-foreground">
                      Ask the Dungeon Master to depict major scenes and character introductions.
                      Leave the endpoint URL blank to turn this off entirely.
                    </p>
                    {imageFootprint !== null && (
                      <p className="text-xs text-muted-foreground">
                        {imageFootprint.count > 0
                          ? `${imageFootprint.count} scene${imageFootprint.count === 1 ? "" : "s"} · ${formatBytes(
                              imageFootprint.bytes,
                            )} stored`
                          : "No scene images stored yet."}
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="image-api-url">Image endpoint</Label>
                      <Input
                        id="image-api-url"
                        value={imageApiUrl}
                        onChange={(e) => setImageApiUrl(e.target.value)}
                        placeholder="e.g. https://api.openai.com/v1/images/generations"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="image-api-key">Image API key (optional)</Label>
                      <Input
                        id="image-api-key"
                        type="password"
                        value={imageApiKey}
                        onChange={(e) => setImageApiKey(e.target.value)}
                        placeholder="Only if the image endpoint uses a different key — the chat key is used otherwise"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="image-model">Image model (optional)</Label>
                      <Input
                        id="image-model"
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        placeholder="e.g. gpt-image-1, flux-1-schnell — leave blank for the provider default"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="image-rate">Min messages between images</Label>
                        <Input
                          id="image-rate"
                          type="number"
                          value={imageRate}
                          onChange={(e) => setImageRate(clampImageRate(Number.parseInt(e.target.value)))}
                          min={MIN_IMAGE_RATE}
                          max={MAX_IMAGE_RATE}
                        />
                        <p className="text-xs text-muted-foreground">
                          At least this many messages must pass between image requests (1-{MAX_IMAGE_RATE}).
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="image-size">Image size</Label>
                        <Input
                          id="image-size"
                          value={imageSize}
                          onChange={(e) => setImageSize(e.target.value)}
                          placeholder="1280x720"
                          title="Fixed render size (width x height) — e.g. 1280x720, 1024x1024, 1536x1024"
                        />
                        <p className="text-xs text-muted-foreground">Requested render size; 720p (1280x720) is a good default.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-system-prompt">Custom System Prompt</Label>
                <Textarea
                  id="custom-system-prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Optional. Leave blank to use the built-in D&D Dungeon Master prompt, or enter your own to replace it…"
                  rows={6}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Only your own text lives here. When left blank the built-in Dungeon Master prompt is used
                  automatically and is never shown or pre-filled in this box.
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button>Done</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="flex flex-col w-full" style={{ height: `${chatHeight}px` }}>
        <CardContent
          className="flex-1 min-h-0 overflow-y-auto p-4"
          ref={chatContentRef}
        >
          <MessageList
            messages={messages}
            showThinking={isLoading && !turnHasContent}
            messagesEndRef={messagesEndRef}
            onDeleteMessage={handleDeleteMessage}
            onRegenerateMessage={handleRegenerateMessage}
            regeneratingId={regeneratingId}
            onEdit={startEdit}
            editingId={editingId}
            editDraft={editDraft}
            onEditDraftChange={setEditDraft}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            inFlight={inFlight}
          />
        </CardContent>
        <CardFooter className="border-t p-3">
          <form onSubmit={handleSubmit} className="flex w-full items-end gap-2">
            {/*
              T2.1: multiline composer — players write sentences and paragraphs, not
              one-liners. Auto-grows from 1 line to 6, then scrolls inside (the `rows`
              attribute caps the height; native textarea overflow handles the rest).
              Enter sends; Shift+Enter is a newline (kept explicit in the placeholder).
            */}
            <Textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void handleSubmit(e)
                }
              }}
              rows={Math.min(6, Math.max(1, input === "" ? 1 : input.split("\n").length))}
              placeholder="Type your message…  (Shift+Enter for a new line)"
              disabled={inFlight}
              className="flex-1 min-w-0 text-sm"
            />
            {isLoading || regeneratingId !== null ? (
              // TODO.MD #3.3: while a turn is running, Send becomes Stop
              <Button type="button" variant="destructive" size="sm" onClick={handleStop}>
                <SquareIcon className="h-4 w-4 mr-1" /> Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim() || inFlight} size="sm">
                <SendIcon className="h-4 w-4 mr-1" /> Send
              </Button>
            )}
          </form>
        </CardFooter>
      </Card>

      {/* Confirmation dialog for clearing chat */}
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Chat History</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all chat messages? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearChat}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </TooltipProvider>
  )
}
